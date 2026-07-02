import { Prisma, RecordType } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { OpenAISummaryService } from './openai-summary.service';
import { OpenAITranscriptionService } from './openai-transcription.service';
import { RecordService } from './record.service';

interface PrismaMock {
  record: {
    findMany: jest.Mock;
  };
}

describe('RecordService', () => {
  let prisma: PrismaMock;
  let service: RecordService;

  beforeEach(() => {
    prisma = {
      record: {
        findMany: jest.fn(),
      },
    };
    service = new RecordService(
      prisma as unknown as PrismaService,
      {} as S3Service,
      {} as OpenAITranscriptionService,
      {} as OpenAISummaryService,
    );
  });

  it('returns all records in home records response format ordered by createdAt descending', async () => {
    prisma.record.findMany.mockResolvedValue([
      {
        id: 'record-1',
        type: RecordType.VOICE,
        title: '통화 녹음',
        createdAt: new Date('2026-07-02T01:00:00.000Z'),
        voiceDurationSeconds: 65,
        people: [
          {
            person: {
              name: '김영희',
            },
          },
          {
            person: {
              name: '홍길동',
            },
          },
        ],
      },
      {
        id: 'record-2',
        type: RecordType.TEXT,
        title: '메모',
        createdAt: new Date('2026-07-01T01:00:00.000Z'),
        voiceDurationSeconds: null,
        people: [],
      },
    ]);

    await expect(service.getRecords('user-1')).resolves.toEqual([
      {
        id: 'record-1',
        type: 'VOICE',
        title: '통화 녹음',
        people: ['김영희', '홍길동'],
        createdAt: '2026-07-02T01:00:00.000Z',
        voiceDuration: '01:05',
      },
      {
        id: 'record-2',
        type: 'TEXT',
        title: '메모',
        people: [],
        createdAt: '2026-07-01T01:00:00.000Z',
        voiceDuration: null,
      },
    ]);

    expect(prisma.record.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: {
        id: true,
        type: true,
        title: true,
        createdAt: true,
        voiceDurationSeconds: true,
        people: {
          select: {
            person: {
              select: {
                name: true,
              },
            },
          },
          orderBy: {
            person: {
              name: Prisma.SortOrder.asc,
            },
          },
        },
      },
      orderBy: { createdAt: Prisma.SortOrder.desc },
    });
  });
});
