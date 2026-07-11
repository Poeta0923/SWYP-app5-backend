import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { VoiceSttJobStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PiiCryptoService } from '../privacy/pii-crypto.service';
import { S3Service } from '../s3/s3.service';
import { AudioDownsampleService } from './audio-downsample.service';
import { OpenAISummaryService } from './openai-summary.service';
import { OpenAITranscriptionService } from './openai-transcription.service';
import { VoiceSttJobService } from './voice-stt-job.service';
import type { VoiceRecordFile } from './record.service';

const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

interface PrismaMock {
  $transaction: jest.Mock;
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
  recordMemo: { create: jest.Mock };
}

describe('VoiceSttJobService', () => {
  let prisma: PrismaMock;
  let s3Service: { uploadFile: jest.Mock; deleteFiles: jest.Mock };
  let audioDownsampleService: { downsample: jest.Mock };
  let transcriptionService: { transcribe: jest.Mock };
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
      summaryService as unknown as OpenAISummaryService,
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
