import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MediaFileType,
  MediaFileUsage,
  RecordType,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service, type UploadedS3File } from '../s3/s3.service';
import { OpenAISummaryService } from './openai-summary.service';
import { OpenAITranscriptionService } from './openai-transcription.service';

export interface VoiceRecordFile {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
}

export interface VoiceRecordSttResponse {
  id: string;
}

export interface VoiceRecordSummaryResponse {
  recordId: string;
  title: string;
  createdAt: string;
  keyword: string[];
  content: string;
  recordMemo: string;
}

interface UploadedVoiceStorageFile extends UploadedS3File {
  originalName?: string;
}

@Injectable()
export class RecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly openAITranscriptionService: OpenAITranscriptionService,
    private readonly openAISummaryService: OpenAISummaryService,
  ) {}

  async createVoiceRecordFromStt(
    userId: string,
    file: VoiceRecordFile,
    recordMemo: string,
  ): Promise<VoiceRecordSttResponse> {
    const uploadedFileKeys: string[] = [];

    try {
      const uploadedVoiceFile = await this.uploadVoiceFile(
        userId,
        file,
        uploadedFileKeys,
      );
      const transcribedText =
        await this.openAITranscriptionService.transcribe(file);

      const createdRecordId = await this.prisma.$transaction(async (tx) => {
        const voiceFile = await tx.mediaFile.create({
          data: this.toVoiceMediaFileCreateData(userId, uploadedVoiceFile),
        });
        const record = await tx.record.create({
          data: {
            userId,
            type: RecordType.VOICE,
            content: transcribedText,
            voiceFileId: voiceFile.id,
          },
        });

        await tx.recordMemo.create({
          data: {
            userId,
            recordId: record.id,
            content: recordMemo.trim(),
          },
        });

        return record.id;
      });

      return {
        id: createdRecordId,
      };
    } catch (error) {
      await this.deleteUploadedFiles(uploadedFileKeys);
      throw error;
    }
  }

  async summarizeVoiceRecord(
    userId: string,
    recordId: string,
  ): Promise<VoiceRecordSummaryResponse> {
    const record = await this.prisma.record.findFirst({
      where: {
        id: recordId,
        userId,
        type: RecordType.VOICE,
      },
      select: {
        id: true,
        content: true,
      },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'VOICE_RECORD_NOT_FOUND',
        message: '요약할 음성 기록을 찾을 수 없습니다.',
        recordId,
      });
    }

    const content = record.content?.trim();

    if (!content) {
      throw new BadRequestException({
        code: 'VOICE_RECORD_CONTENT_EMPTY',
        message: '요약할 기록 내용이 없습니다.',
        recordId,
      });
    }

    const summaryResult = await this.openAISummaryService.summarize(content);

    const updatedRecord = await this.prisma.$transaction(async (tx) => {
      await tx.recordKeyword.deleteMany({
        where: {
          recordId: record.id,
          userId,
        },
      });

      await tx.recordKeyword.createMany({
        data: summaryResult.keywords.map((keyword) => ({
          userId,
          recordId: record.id,
          name: keyword,
        })),
        skipDuplicates: true,
      });

      return tx.record.update({
        where: {
          id: record.id,
        },
        data: {
          content: summaryResult.summary,
        },
        select: {
          id: true,
          title: true,
          createdAt: true,
          content: true,
          keywords: {
            select: {
              name: true,
            },
            orderBy: {
              name: 'asc',
            },
          },
          recordMemo: {
            select: {
              content: true,
            },
          },
        },
      });
    });

    return {
      recordId: updatedRecord.id,
      title: updatedRecord.title,
      createdAt: updatedRecord.createdAt.toISOString(),
      keyword: updatedRecord.keywords.map((keyword) => keyword.name),
      content: updatedRecord.content ?? '',
      recordMemo: updatedRecord.recordMemo?.content ?? '',
    };
  }

  private async uploadVoiceFile(
    userId: string,
    file: VoiceRecordFile,
    uploadedFileKeys: string[],
  ): Promise<UploadedVoiceStorageFile> {
    const uploadedFile = await this.s3Service.uploadFile({
      body: file.buffer,
      contentType: file.mimetype,
      originalName: file.originalname,
      prefix: `records/${userId}/voice`,
    });
    uploadedFileKeys.push(uploadedFile.key);

    return {
      ...uploadedFile,
      originalName: file.originalname,
    };
  }

  private toVoiceMediaFileCreateData(
    userId: string,
    file: UploadedVoiceStorageFile,
  ) {
    return {
      userId,
      type: MediaFileType.AUDIO,
      usage: MediaFileUsage.RECORD_VOICE,
      bucket: file.bucket,
      s3Key: file.key,
      contentType: file.contentType,
      sizeBytes: file.size,
      originalName: file.originalName,
    };
  }

  private async deleteUploadedFiles(keys: string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }

    await this.s3Service.deleteFiles(keys).catch(() => undefined);
  }
}
