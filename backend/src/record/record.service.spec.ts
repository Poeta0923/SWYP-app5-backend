import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, RecordType } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { OpenAISummaryService } from './openai-summary.service';
import { OpenAITranscriptionService } from './openai-transcription.service';
import { RecordService } from './record.service';

interface PrismaMock {
  $transaction: jest.Mock;
  person: {
    findMany: jest.Mock;
  };
  record: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  recordMemo: {
    deleteMany: jest.Mock;
    upsert: jest.Mock;
  };
  recordPerson: {
    deleteMany: jest.Mock;
    createMany: jest.Mock;
  };
}

describe('RecordService', () => {
  let prisma: PrismaMock;
  let s3Service: {
    getSignedUrl: jest.Mock;
  };
  let service: RecordService;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((callback: (tx: PrismaMock) => unknown) =>
        callback(prisma),
      ),
      person: {
        findMany: jest.fn(),
      },
      record: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      recordMemo: {
        deleteMany: jest.fn(),
        upsert: jest.fn(),
      },
      recordPerson: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };
    s3Service = {
      getSignedUrl: jest.fn(
        (key: string) => `https://signed.example.com/${key}`,
      ),
    };
    service = new RecordService(
      prisma as unknown as PrismaService,
      s3Service as unknown as S3Service,
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

  it('returns voice record details with signed profile and voice URLs', async () => {
    prisma.record.findFirst.mockResolvedValue({
      id: 'record-1',
      title: '통화 녹음',
      createdAt: new Date('2026-07-02T01:00:00.000Z'),
      content: '회의 내용 전문',
      people: [
        {
          person: {
            id: 'person-2',
            name: '김영희',
            profileImageFile: null,
          },
        },
        {
          person: {
            id: 'person-1',
            name: '홍길동',
            profileImageFile: {
              s3Key: 'people/user-1/profiles/profile.png',
            },
          },
        },
      ],
      keywords: [{ name: '미팅' }, { name: '후속 액션' }],
      recordMemo: {
        content: '요약해 주세요',
      },
      voiceFile: {
        s3Key: 'records/user-1/voice/recording.m4a',
      },
    });

    await expect(service.getVoiceRecord('user-1', 'record-1')).resolves.toEqual(
      {
        recordId: 'record-1',
        title: '통화 녹음',
        createdAt: '2026-07-02T01:00:00.000Z',
        recordPeople: [
          {
            id: 'person-2',
            name: '김영희',
            image: null,
          },
          {
            id: 'person-1',
            name: '홍길동',
            image:
              'https://signed.example.com/people/user-1/profiles/profile.png',
          },
        ],
        recordKeywords: ['미팅', '후속 액션'],
        content: '회의 내용 전문',
        recordMemo: '요약해 주세요',
        voiceFileUrl:
          'https://signed.example.com/records/user-1/voice/recording.m4a',
      },
    );

    expect(prisma.record.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'record-1',
        userId: 'user-1',
        type: RecordType.VOICE,
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        content: true,
        people: {
          select: {
            person: {
              select: {
                id: true,
                name: true,
                profileImageFile: {
                  select: {
                    s3Key: true,
                  },
                },
              },
            },
          },
          orderBy: {
            person: {
              name: Prisma.SortOrder.asc,
            },
          },
        },
        keywords: {
          select: {
            name: true,
          },
          orderBy: {
            name: Prisma.SortOrder.asc,
          },
        },
        recordMemo: {
          select: {
            content: true,
          },
        },
        voiceFile: {
          select: {
            s3Key: true,
          },
        },
      },
    });
    expect(s3Service.getSignedUrl).toHaveBeenCalledWith(
      'people/user-1/profiles/profile.png',
    );
    expect(s3Service.getSignedUrl).toHaveBeenCalledWith(
      'records/user-1/voice/recording.m4a',
    );
  });

  it('throws not found when the voice record detail does not exist for the user', async () => {
    prisma.record.findFirst.mockResolvedValue(null);

    await expect(
      service.getVoiceRecord('user-1', 'record-missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates a voice record title, memo, and replaces connected people', async () => {
    prisma.record.findFirst
      .mockResolvedValueOnce({ id: 'record-1' })
      .mockResolvedValueOnce({
        id: 'record-1',
        title: '미팅 기록',
        updatedAt: new Date('2026-07-02T02:00:00.000Z'),
        recordMemo: {
          content: '다시 볼 것',
        },
        people: [
          {
            person: {
              id: 'person-2',
              name: '김영희',
            },
          },
          {
            person: {
              id: 'person-1',
              name: '홍길동',
            },
          },
        ],
      });
    prisma.person.findMany.mockResolvedValue([
      { id: 'person-1' },
      { id: 'person-2' },
    ]);
    prisma.record.update.mockResolvedValue({});
    prisma.recordMemo.upsert.mockResolvedValue({});
    prisma.recordPerson.deleteMany.mockResolvedValue({ count: 1 });
    prisma.recordPerson.createMany.mockResolvedValue({ count: 2 });

    await expect(
      service.updateVoiceRecord('user-1', 'record-1', {
        title: '미팅 기록',
        recordMemo: '다시 볼 것',
        personIds: ['person-1', 'person-2'],
      }),
    ).resolves.toEqual({
      recordId: 'record-1',
      title: '미팅 기록',
      recordMemo: '다시 볼 것',
      people: [
        {
          id: 'person-2',
          name: '김영희',
        },
        {
          id: 'person-1',
          name: '홍길동',
        },
      ],
      updatedAt: '2026-07-02T02:00:00.000Z',
    });

    expect(prisma.record.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'record-1',
        userId: 'user-1',
        type: RecordType.VOICE,
      },
      select: {
        id: true,
      },
    });
    expect(prisma.person.findMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['person-1', 'person-2'],
        },
        userId: 'user-1',
      },
      select: {
        id: true,
      },
    });
    expect(prisma.record.update).toHaveBeenCalledWith({
      where: {
        id_userId: {
          id: 'record-1',
          userId: 'user-1',
        },
      },
      data: {
        updatedAt: expect.any(Date) as Date,
        title: '미팅 기록',
      },
    });
    expect(prisma.recordMemo.upsert).toHaveBeenCalledWith({
      where: {
        recordId_userId: {
          recordId: 'record-1',
          userId: 'user-1',
        },
      },
      create: {
        recordId: 'record-1',
        userId: 'user-1',
        content: '다시 볼 것',
      },
      update: {
        content: '다시 볼 것',
      },
    });
    expect(prisma.recordPerson.deleteMany).toHaveBeenCalledWith({
      where: {
        recordId: 'record-1',
        userId: 'user-1',
      },
    });
    expect(prisma.recordPerson.createMany).toHaveBeenCalledWith({
      data: [
        {
          recordId: 'record-1',
          personId: 'person-1',
          userId: 'user-1',
        },
        {
          recordId: 'record-1',
          personId: 'person-2',
          userId: 'user-1',
        },
      ],
      skipDuplicates: true,
    });
    expect(prisma.record.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'record-1',
        userId: 'user-1',
        type: RecordType.VOICE,
      },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        recordMemo: {
          select: {
            content: true,
          },
        },
        people: {
          select: {
            person: {
              select: {
                id: true,
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
    });
  });

  it('deletes a voice record memo and all connected people when null memo and empty personIds are provided', async () => {
    prisma.record.findFirst
      .mockResolvedValueOnce({ id: 'record-1' })
      .mockResolvedValueOnce({
        id: 'record-1',
        title: '미팅 기록',
        updatedAt: new Date('2026-07-02T02:00:00.000Z'),
        recordMemo: null,
        people: [],
      });
    prisma.record.update.mockResolvedValue({});
    prisma.recordMemo.deleteMany.mockResolvedValue({ count: 1 });
    prisma.recordPerson.deleteMany.mockResolvedValue({ count: 2 });

    await expect(
      service.updateVoiceRecord('user-1', 'record-1', {
        recordMemo: null,
        personIds: [],
      }),
    ).resolves.toEqual({
      recordId: 'record-1',
      title: '미팅 기록',
      recordMemo: null,
      people: [],
      updatedAt: '2026-07-02T02:00:00.000Z',
    });

    expect(prisma.person.findMany).not.toHaveBeenCalled();
    expect(prisma.recordMemo.deleteMany).toHaveBeenCalledWith({
      where: {
        recordId: 'record-1',
        userId: 'user-1',
      },
    });
    expect(prisma.recordMemo.upsert).not.toHaveBeenCalled();
    expect(prisma.recordPerson.deleteMany).toHaveBeenCalledWith({
      where: {
        recordId: 'record-1',
        userId: 'user-1',
      },
    });
    expect(prisma.recordPerson.createMany).not.toHaveBeenCalled();
  });

  it('rejects updates when no editable fields are provided', async () => {
    await expect(
      service.updateVoiceRecord('user-1', 'record-1', {}),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.record.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws not found when the voice record does not exist for the user', async () => {
    prisma.record.findFirst.mockResolvedValue(null);

    await expect(
      service.updateVoiceRecord('user-1', 'record-missing', {
        title: '미팅 기록',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects unknown person IDs before replacing record people', async () => {
    prisma.record.findFirst.mockResolvedValue({ id: 'record-1' });
    prisma.person.findMany.mockResolvedValue([{ id: 'person-1' }]);

    await expect(
      service.updateVoiceRecord('user-1', 'record-1', {
        personIds: ['person-1', 'person-missing'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
