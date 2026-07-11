import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import {
  MediaFileType,
  MediaFileUsage,
  RecordType,
  VoiceSttJobStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PiiCryptoService } from '../privacy/pii-crypto.service';
import { S3Service } from '../s3/s3.service';
import { AudioDownsampleService } from './audio-downsample.service';
import { OpenAISummaryService } from './openai-summary.service';
import { OpenAITranscriptionService } from './openai-transcription.service';
import type { VoiceRecordFile } from './record.service';

export interface VoiceSttJobCreateResponse {
  jobId: string;
}

export interface VoiceSttJobStatusResponse {
  status: VoiceSttJobStatus;
  recordId: string | null;
  errorCode: string | null;
}

interface JobFailure {
  errorCode: string;
  errorMessage: string;
}

@Injectable()
export class VoiceSttJobService implements OnModuleInit {
  private readonly logger = new Logger(VoiceSttJobService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly audioDownsampleService: AudioDownsampleService,
    private readonly openAITranscriptionService: OpenAITranscriptionService,
    private readonly openAISummaryService: OpenAISummaryService,
    @Optional()
    private readonly piiCryptoService: PiiCryptoService = new PiiCryptoService(),
  ) {}

  /**
   * 인프로세스 처리라 진행 중이던 잡은 프로세스가 살아 있는 동안만 존재한다.
   * 단일 태스크 전제상 부팅 시점에 남아 있는 PROCESSING 잡은 이전 프로세스가
   * 재시작/배포로 죽으면서 버려진 고아이므로 FAILED로 정리한다.
   */
  async onModuleInit(): Promise<void> {
    const { count } = await this.prisma.voiceSttJob.updateMany({
      where: {
        status: {
          in: [
            VoiceSttJobStatus.STT_PROCESSING,
            VoiceSttJobStatus.SUMMARY_PROCESSING,
          ],
        },
      },
      data: {
        status: VoiceSttJobStatus.FAILED,
        errorCode: 'SERVER_RESTARTED',
        errorMessage: '서버 재시작으로 처리가 중단되었습니다.',
      },
    });

    if (count > 0) {
      this.logger.warn(
        `서버 재시작으로 중단된 음성 STT 잡 ${count}건을 FAILED 처리했습니다.`,
      );
    }
  }

  /**
   * 음성 파일을 S3에 저장하고 STT 잡을 생성한 뒤, 실제 전사/요약은
   * 백그라운드로 처리하고 즉시 jobId를 반환한다. 클라이언트는 status를 폴링한다.
   */
  async createAndStart(
    userId: string,
    file: VoiceRecordFile,
    recordMemo: string | null,
  ): Promise<VoiceSttJobCreateResponse> {
    const uploadedFile = await this.s3Service.uploadFile({
      body: file.buffer,
      contentType: file.mimetype,
      originalName: file.originalname,
      prefix: `records/${userId}/voice`,
    });

    let jobId: string;

    try {
      const job = await this.prisma.$transaction(async (tx) => {
        const voiceFile = await tx.mediaFile.create({
          data: {
            userId,
            type: MediaFileType.AUDIO,
            usage: MediaFileUsage.RECORD_VOICE,
            bucket: uploadedFile.bucket,
            s3Key: uploadedFile.key,
            contentType: uploadedFile.contentType,
            sizeBytes: uploadedFile.size,
            originalName: file.originalname,
          },
        });

        return tx.voiceSttJob.create({
          data: {
            userId,
            status: VoiceSttJobStatus.STT_PROCESSING,
            voiceFileId: voiceFile.id,
            recordMemo: this.piiCryptoService.encrypt(recordMemo),
          },
          select: { id: true },
        });
      });

      jobId = job.id;
    } catch (error) {
      // 잡 생성이 실패하면 방금 올린 파일은 고아가 되므로 정리한다.
      await this.s3Service
        .deleteFiles([uploadedFile.key])
        .catch(() => undefined);
      throw error;
    }

    // 요청 생명주기와 분리해 백그라운드로 처리한다. 어떤 에러도 밖으로
    // 새어나가 프로세스를 죽이지 않도록 반드시 catch로 격리한다.
    void this.process(jobId, file.buffer).catch((error) => {
      this.logger.error(
        `음성 STT 잡 처리 중 예기치 못한 오류 (jobId=${jobId})`,
        error instanceof Error ? error.stack : String(error),
      );
    });

    return { jobId };
  }

  async getStatus(
    userId: string,
    jobId: string,
  ): Promise<VoiceSttJobStatusResponse> {
    const job = await this.prisma.voiceSttJob.findFirst({
      where: { id: jobId, userId },
      select: { status: true, recordId: true, errorCode: true },
    });

    if (!job) {
      throw new NotFoundException({
        code: 'VOICE_STT_JOB_NOT_FOUND',
        message: '음성 STT 잡을 찾을 수 없습니다.',
        jobId,
      });
    }

    return {
      status: job.status,
      recordId: job.recordId,
      errorCode: job.errorCode,
    };
  }

  private async process(jobId: string, buffer: Buffer): Promise<void> {
    const job = await this.prisma.voiceSttJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        userId: true,
        voiceFileId: true,
        recordMemo: true,
      },
    });

    if (!job) {
      return;
    }

    try {
      const downsampled = await this.audioDownsampleService.downsample(buffer);
      const transcribedText =
        await this.openAITranscriptionService.transcribe(downsampled);

      await this.prisma.voiceSttJob.update({
        where: { id: job.id },
        data: { status: VoiceSttJobStatus.SUMMARY_PROCESSING },
      });

      const summary =
        await this.openAISummaryService.summarize(transcribedText);

      await this.prisma.$transaction(async (tx) => {
        const record = await tx.record.create({
          data: {
            userId: job.userId,
            type: RecordType.VOICE,
            content: this.piiCryptoService.encrypt(summary.summary),
            voiceFileId: job.voiceFileId,
          },
          select: { id: true },
        });

        await tx.recordKeyword.createMany({
          data: summary.keywords.map((name) => ({
            userId: job.userId,
            recordId: record.id,
            name,
          })),
          skipDuplicates: true,
        });

        if (job.recordMemo) {
          await tx.recordMemo.create({
            data: {
              userId: job.userId,
              recordId: record.id,
              // 잡 생성 시 이미 암호화해 저장했으므로 그대로 옮긴다.
              content: job.recordMemo,
            },
          });
        }

        await tx.voiceSttJob.update({
          where: { id: job.id },
          data: {
            status: VoiceSttJobStatus.COMPLETED,
            recordId: record.id,
            errorCode: null,
            errorMessage: null,
          },
        });
      });
    } catch (error) {
      await this.markFailed(job.id, this.toJobFailure(error));
    }
  }

  private async markFailed(jobId: string, failure: JobFailure): Promise<void> {
    // 실패해도 업로드된 음성 파일/MediaFile은 지우지 않는다. voiceFile FK가
    // cascade라 MediaFile을 지우면 잡까지 삭제돼 클라이언트가 상태를 폴링할 수
    // 없게 되기 때문이다. 잡은 FAILED로 남겨 폴링 가능하게 둔다.
    await this.prisma.voiceSttJob
      .update({
        where: { id: jobId },
        data: {
          status: VoiceSttJobStatus.FAILED,
          errorCode: failure.errorCode,
          errorMessage: failure.errorMessage,
        },
      })
      .catch((error) => {
        this.logger.error(
          `음성 STT 잡 FAILED 갱신 실패 (jobId=${jobId})`,
          error instanceof Error ? error.stack : String(error),
        );
      });
  }

  private toJobFailure(error: unknown): JobFailure {
    if (this.isHttpExceptionWithCode(error)) {
      const response = error.getResponse() as {
        code?: unknown;
        message?: unknown;
      };

      return {
        errorCode:
          typeof response.code === 'string'
            ? response.code
            : 'STT_PIPELINE_FAILED',
        errorMessage:
          typeof response.message === 'string'
            ? response.message
            : '음성 STT 처리에 실패했습니다.',
      };
    }

    return {
      errorCode: 'STT_PIPELINE_FAILED',
      errorMessage:
        error instanceof Error
          ? error.message
          : '음성 STT 처리에 실패했습니다.',
    };
  }

  private isHttpExceptionWithCode(
    error: unknown,
  ): error is { getResponse: () => unknown } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'getResponse' in error &&
      typeof error.getResponse === 'function'
    );
  }
}
