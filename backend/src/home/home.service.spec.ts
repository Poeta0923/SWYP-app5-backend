import { Prisma, RecordType } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { HomeService } from './home.service';

interface PrismaMock {
  schedule: {
    findMany: jest.Mock;
  };
  person: {
    findMany: jest.Mock;
  };
  record: {
    findMany: jest.Mock;
  };
}

describe('HomeService', () => {
  let prisma: PrismaMock;
  let s3Service: {
    getSignedUrl: jest.Mock;
  };
  let service: HomeService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-29T01:00:00.000Z'));
    prisma = {
      schedule: {
        findMany: jest.fn(),
      },
      person: {
        findMany: jest.fn(),
      },
      record: {
        findMany: jest.fn(),
      },
    };
    s3Service = {
      getSignedUrl: jest.fn(
        (key: string) => `https://signed.example.com/${key}`,
      ),
    };
    service = new HomeService(
      prisma as unknown as PrismaService,
      s3Service as unknown as S3Service,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns home schedules, important people, and recent records', async () => {
    prisma.schedule.findMany.mockResolvedValue([
      {
        id: 'schedule-1',
        title: '오늘 미팅',
        scheduleTime: new Date('2026-06-29T08:00:00.000Z'),
      },
      {
        id: 'schedule-2',
        title: '내일 점심',
        scheduleTime: new Date('2026-06-30T03:00:00.000Z'),
      },
    ]);
    prisma.person.findMany.mockResolvedValue([
      {
        id: 'person-1',
        name: '홍길동',
        isImportant: true,
        job: '개발/IT',
        company: '토스',
        position: '과장',
        relationship: '동료',
        profileImageFile: {
          s3Key: 'profiles/profile.png',
        },
      },
      {
        id: 'person-2',
        name: '김영희',
        isImportant: true,
        job: null,
        company: null,
        position: null,
        relationship: null,
        profileImageFile: null,
      },
    ]);
    prisma.record.findMany.mockResolvedValue([
      {
        id: 'record-1',
        type: RecordType.VOICE,
        title: '통화 녹음',
        createdAt: new Date('2026-06-29T00:30:00.000Z'),
        bookMark: true,
        voiceDurationSeconds: 185,
        people: [
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
        createdAt: new Date('2026-06-28T10:00:00.000Z'),
        bookMark: false,
        voiceDurationSeconds: null,
        people: [],
      },
    ]);

    await expect(service.getHome('user-1')).resolves.toEqual({
      schedules: [
        {
          id: 'schedule-1',
          title: '오늘 미팅',
          scheduleTime: '2026-06-29T08:00:00.000Z',
          dDay: 'D-0',
        },
        {
          id: 'schedule-2',
          title: '내일 점심',
          scheduleTime: '2026-06-30T03:00:00.000Z',
          dDay: 'D-1',
        },
      ],
      people: [
        {
          id: 'person-1',
          name: '홍길동',
          isImportant: true,
          job: '개발/IT',
          company: '토스',
          position: '과장',
          relationship: '동료',
          image: 'https://signed.example.com/profiles/profile.png',
        },
        {
          id: 'person-2',
          name: '김영희',
          isImportant: true,
          job: null,
          company: null,
          position: null,
          relationship: null,
          image: null,
        },
      ],
      records: [
        {
          id: 'record-1',
          type: 'VOICE',
          title: '통화 녹음',
          people: ['홍길동'],
          createdAt: '2026-06-29T00:30:00.000Z',
          bookMark: true,
          voiceDuration: '03:05',
        },
        {
          id: 'record-2',
          type: 'TEXT',
          title: '메모',
          people: [],
          createdAt: '2026-06-28T10:00:00.000Z',
          bookMark: false,
          voiceDuration: null,
        },
      ],
    });

    expect(prisma.schedule.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        scheduleTime: {
          gte: new Date('2026-06-29T01:00:00.000Z'),
        },
      },
      select: {
        id: true,
        title: true,
        scheduleTime: true,
      },
      orderBy: { scheduleTime: Prisma.SortOrder.asc },
      take: 5,
    });
    expect(prisma.person.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        isImportant: true,
      },
      select: {
        id: true,
        name: true,
        isImportant: true,
        job: true,
        company: true,
        position: true,
        relationship: true,
        profileImageFile: {
          select: {
            s3Key: true,
          },
        },
      },
      orderBy: { interactedAt: Prisma.SortOrder.desc },
      take: 3,
    });
    expect(prisma.record.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: {
        id: true,
        type: true,
        title: true,
        createdAt: true,
        bookMark: true,
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
      orderBy: [
        { bookMark: Prisma.SortOrder.desc },
        { createdAt: Prisma.SortOrder.desc },
      ],
      take: 5,
    });
    expect(s3Service.getSignedUrl).toHaveBeenCalledWith('profiles/profile.png');
  });

  it('returns empty arrays when there is no home content', async () => {
    prisma.schedule.findMany.mockResolvedValue([]);
    prisma.person.findMany.mockResolvedValue([]);
    prisma.record.findMany.mockResolvedValue([]);

    await expect(service.getHome('user-1')).resolves.toEqual({
      schedules: [],
      people: [],
      records: [],
    });
  });
});
