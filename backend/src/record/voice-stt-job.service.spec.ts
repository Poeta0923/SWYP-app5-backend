import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { UserPlan, VoiceSttJobStatus } from '../../generated/prisma/client';
import { EntitlementService } from '../plans/entitlement.service';
import { PrismaService } from '../prisma/prisma.service';
import { PiiCryptoService } from '../privacy/pii-crypto.service';
import { S3Service } from '../s3/s3.service';
import { AudioDownsampleService } from './audio-downsample.service';
import { GoogleSpeechTranscriptionService } from './google-speech-transcription.service';
import { OpenAISummaryService } from './openai-summary.service';
import { OpenAITranscriptionService } from './openai-transcription.service';
import { VoiceSttJobService } from './voice-stt-job.service';
import type { VoiceRecordFile } from './record.service';

const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

interface PrismaMock {
  $transaction: jest.Mock;
  user: { findUniqueOrThrow: jest.Mock };
  mediaFile: { create: jest.Mock };
  voiceSttJob: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  record: { create: jest.Mock };
  recordKeyword: { createMany: jest.Mock };
  recordTranscriptSegment: { createMany: jest.Mock };
  recordMemo: { create: jest.Mock };
}

describe('VoiceSttJobService', () => {
  let prisma: PrismaMock;
  let s3Service: { uploadFile: jest.Mock; deleteFiles: jest.Mock };
  let audioDownsampleService: { downsample: jest.Mock };
  let transcriptionService: { transcribe: jest.Mock };
  let googleSpeechService: { transcribeWithDiarization: jest.Mock };
  let summaryService: { summarize: jest.Mock };
  let service: VoiceSttJobService;

  const file: VoiceRecordFile = {
    buffer: Buffer.from('original-audio'),
    mimetype: 'audio/m4a',
    originalname: 'recording.m4a',
    size: 14,
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((callback: (tx: PrismaMock) => unknown) =>
        callback(prisma),
      ),
      // 기본은 비-Premium이라 Whisper 경로를 탄다. Premium 테스트에서만 오버라이드.
      user: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ plan: UserPlan.Basic }),
      },
      mediaFile: { create: jest.fn().mockResolvedValue({ id: 'media-1' }) },
      voiceSttJob: {
        create: jest.fn().mockResolvedValue({ id: 'job-1' }),
        findFirst: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          id: 'job-1',
          userId: 'user-1',
          voiceFileId: 'media-1',
          recordMemo: 'enc(메모)',
        }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      record: { create: jest.fn().mockResolvedValue({ id: 'record-1' }) },
      recordKeyword: { createMany: jest.fn().mockResolvedValue({}) },
      recordTranscriptSegment: { createMany: jest.fn().mockResolvedValue({}) },
      recordMemo: { create: jest.fn().mockResolvedValue({}) },
    };
    s3Service = {
      uploadFile: jest.fn().mockResolvedValue({
        bucket: 'bucket',
        key: 'records/user-1/voice/a.m4a',
        url: 'https://cdn/a.m4a',
        contentType: 'audio/m4a',
        size: 14,
      }),
      deleteFiles: jest.fn().mockResolvedValue(undefined),
    };
    audioDownsampleService = {
      downsample: jest.fn().mockResolvedValue({
        buffer: Buffer.from('mp3'),
        mimetype: 'audio/mpeg',
        originalname: 'recording.mp3',
      }),
    };
    transcriptionService = {
      transcribe: jest.fn().mockResolvedValue('전사된 텍스트'),
    };
    googleSpeechService = {
      transcribeWithDiarization: jest.fn(),
    };
    summaryService = {
      summarize: jest.fn().mockResolvedValue({
        summary: '요약본',
        keywords: ['a', 'b', 'c'],
      }),
    };

    const crypto = {
      encrypt: (value: string | null) =>
        value === null ? null : `enc(${value})`,
    };

    service = new VoiceSttJobService(
      prisma as unknown as PrismaService,
      s3Service as unknown as S3Service,
      audioDownsampleService as unknown as AudioDownsampleService,
      transcriptionService as unknown as OpenAITranscriptionService,
      googleSpeechService as unknown as GoogleSpeechTranscriptionService,
      summaryService as unknown as OpenAISummaryService,
      {
        assertVoiceStorageAvailable: jest.fn().mockResolvedValue(undefined),
        assertCanAddPeople: jest.fn().mockResolvedValue(undefined),
      } as unknown as EntitlementService,
      crypto as unknown as PiiCryptoService,
    );
  });

  it('uploads the file, creates a job, and returns the jobId', async () => {
    const result = await service.createAndStart('user-1', file, '메모');

    expect(result).toEqual({ jobId: 'job-1' });
    expect(s3Service.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        body: file.buffer,
        prefix: 'records/user-1/voice',
      }),
    );
    expect(prisma.voiceSttJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          voiceFileId: 'media-1',
          recordMemo: 'enc(메모)',
          status: VoiceSttJobStatus.STT_PROCESSING,
        }),
      }),
    );
  });

  it('runs the background pipeline to completion and creates the record', async () => {
    await service.createAndStart('user-1', file, '메모');
    await flushAsync();

    expect(audioDownsampleService.downsample).toHaveBeenCalledWith(file.buffer);
    expect(transcriptionService.transcribe).toHaveBeenCalled();
    expect(summaryService.summarize).toHaveBeenCalledWith('전사된 텍스트');
    expect(prisma.record.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: 'enc(요약본)',
          voiceFileId: 'media-1',
        }),
      }),
    );
    expect(prisma.recordKeyword.createMany).toHaveBeenCalled();
    expect(prisma.voiceSttJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: VoiceSttJobStatus.COMPLETED,
          recordId: 'record-1',
        }),
      }),
    );
  });

  it('uses Google STT diarization and stores speaker segments for Premium users', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      plan: UserPlan.Premium,
    });
    googleSpeechService.transcribeWithDiarization.mockResolvedValue({
      text: '전체 전사',
      segments: [
        { speaker: 1, text: '안녕하세요' },
        { speaker: 2, text: '반갑습니다' },
      ],
    });

    await service.createAndStart('user-1', file, '메모');
    await flushAsync();

    expect(googleSpeechService.transcribeWithDiarization).toHaveBeenCalledWith(
      Buffer.from('mp3'),
    );
    expect(transcriptionService.transcribe).not.toHaveBeenCalled();
    // 화자 라벨을 붙인 텍스트를 요약 입력으로 넘긴다.
    expect(summaryService.summarize).toHaveBeenCalledWith(
      '화자1: 안녕하세요\n화자2: 반갑습니다',
    );
    expect(prisma.recordTranscriptSegment.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          {
            userId: 'user-1',
            recordId: 'record-1',
            seq: 0,
            speaker: 1,
            content: 'enc(안녕하세요)',
          },
          {
            userId: 'user-1',
            recordId: 'record-1',
            seq: 1,
            speaker: 2,
            content: 'enc(반갑습니다)',
          },
        ],
      }),
    );
  });

  it('falls back to Whisper and still creates the record when diarization fails (Premium)', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValue({
      plan: UserPlan.Premium,
    });
    googleSpeechService.transcribeWithDiarization.mockRejectedValue(
      new BadGatewayException({
        code: 'GOOGLE_STT_TOO_LARGE',
        message: '용량 초과',
      }),
    );

    await service.createAndStart('user-1', file, '메모');
    await flushAsync();

    // 화자 분리 실패 → Whisper로 폴백
    expect(transcriptionService.transcribe).toHaveBeenCalled();
    expect(summaryService.summarize).toHaveBeenCalledWith('전사된 텍스트');
    // 기록은 정상 생성되고, 세그먼트는 저장하지 않는다.
    expect(prisma.record.create).toHaveBeenCalled();
    expect(prisma.recordTranscriptSegment.createMany).not.toHaveBeenCalled();
    expect(prisma.voiceSttJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: VoiceSttJobStatus.COMPLETED,
        }),
      }),
    );
  });

  it('marks the job FAILED without deleting the uploaded file when the pipeline throws', async () => {
    transcriptionService.transcribe.mockRejectedValue(
      new BadGatewayException({
        code: 'OPENAI_TRANSCRIPTION_TIMEOUT',
        message: '시간 초과',
      }),
    );

    await service.createAndStart('user-1', file, null);
    await flushAsync();

    expect(prisma.record.create).not.toHaveBeenCalled();
    expect(s3Service.deleteFiles).not.toHaveBeenCalled();
    expect(prisma.voiceSttJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: VoiceSttJobStatus.FAILED,
          errorCode: 'OPENAI_TRANSCRIPTION_TIMEOUT',
        }),
      }),
    );
  });

  it('cleans up the uploaded file when job creation fails', async () => {
    prisma.$transaction.mockRejectedValueOnce(new Error('db down'));

    await expect(service.createAndStart('user-1', file, null)).rejects.toThrow(
      'db down',
    );

    expect(s3Service.deleteFiles).toHaveBeenCalledWith([
      'records/user-1/voice/a.m4a',
    ]);
  });

  it('returns job status and throws when the job is missing', async () => {
    prisma.voiceSttJob.findFirst.mockResolvedValueOnce({
      status: VoiceSttJobStatus.COMPLETED,
      recordId: 'record-1',
      errorCode: null,
    });

    await expect(service.getStatus('user-1', 'job-1')).resolves.toEqual({
      status: VoiceSttJobStatus.COMPLETED,
      recordId: 'record-1',
      errorCode: null,
    });

    prisma.voiceSttJob.findFirst.mockResolvedValueOnce(null);
    await expect(service.getStatus('user-1', 'missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('fails leftover PROCESSING jobs on boot', async () => {
    prisma.voiceSttJob.updateMany.mockResolvedValueOnce({ count: 2 });

    await service.onModuleInit();

    expect(prisma.voiceSttJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: {
            in: [
              VoiceSttJobStatus.STT_PROCESSING,
              VoiceSttJobStatus.SUMMARY_PROCESSING,
            ],
          },
        },
        data: expect.objectContaining({
          status: VoiceSttJobStatus.FAILED,
          errorCode: 'SERVER_RESTARTED',
        }),
      }),
    );
  });
});
