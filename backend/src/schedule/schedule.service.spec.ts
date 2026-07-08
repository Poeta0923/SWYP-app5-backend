import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { ScheduleService } from './schedule.service';

interface PrismaMock {
  $transaction: jest.Mock;
  schedule: {
    create: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    deleteMany: jest.Mock;
  };
  schedulePerson: {
    createMany: jest.Mock;
    deleteMany: jest.Mock;
  };
  person: {
    findMany: jest.Mock;
  };
  record: {
    findFirst: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  notificationJob: {
    create: jest.Mock;
    updateMany: jest.Mock;
    upsert: jest.Mock;
    deleteMany: jest.Mock;
  };
}

describe('ScheduleService', () => {
  let prisma: PrismaMock;
  let s3Service: {
    getSignedUrl: jest.Mock;
  };
  let service: ScheduleService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-29T01:00:00.000Z'));
    prisma = {
      $transaction: jest.fn(async (callback: (tx: PrismaMock) => unknown) =>
        callback(prisma),
      ),
      schedule: {
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        deleteMany: jest.fn(),
      },
      schedulePerson: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      person: {
        findMany: jest.fn(),
      },
      record: {
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      notificationJob: {
        create: jest.fn(),
        updateMany: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    s3Service = {
      getSignedUrl: jest.fn(
        (key: string) => `https://signed.example.com/${key}`,
      ),
    };
    service = new ScheduleService(
      prisma as unknown as PrismaService,
      s3Service as unknown as S3Service,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates a schedule with people, linked record, and notification job', async () => {
    prisma.person.findMany.mockResolvedValue([
      {
        id: 'person-1',
      },
      {
        id: 'person-2',
      },
    ]);
    prisma.record.findFirst.mockResolvedValue({
      id: 'record-1',
      scheduleId: null,
    });
    prisma.schedule.create.mockResolvedValue({
      id: 'schedule-1',
    });
    prisma.schedule.findFirst.mockResolvedValue({
      id: 'schedule-1',
      title: '오늘 미팅',
      scheduleTime: new Date('2026-06-29T08:00:00.000Z'),
      content: '회의 준비',
      bookMark: false,
      notificationEnabled: true,
      reminderOffsetMinutes: 60,
      people: [
        {
          person: {
            id: 'person-1',
            name: '홍길동',
            profileImageFile: {
              s3Key: 'profiles/profile.png',
            },
          },
        },
        {
          person: {
            id: 'person-2',
            name: '김영희',
            profileImageFile: null,
          },
        },
      ],
    });

    await expect(
      service.createSchedule('user-1', {
        title: '오늘 미팅',
        scheduleTime: '2026-06-29T08:00:00.000Z',
        personIds: ['person-1', 'person-2'],
        notificationEnabled: true,
        reminderOffsetMinutes: 60,
        content: '회의 준비',
        recordId: 'record-1',
      }),
    ).resolves.toEqual({
      id: 'schedule-1',
      title: '오늘 미팅',
      scheduleTime: '2026-06-29T08:00:00.000Z',
      people: [
        {
          id: 'person-1',
          name: '홍길동',
          image: 'https://signed.example.com/profiles/profile.png',
        },
        {
          id: 'person-2',
          name: '김영희',
          image: null,
        },
      ],
      content: '회의 준비',
      bookMark: false,
      notificationEnabled: true,
      reminderOffsetMinutes: 60,
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
    expect(prisma.record.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'record-1',
        userId: 'user-1',
      },
      select: {
        id: true,
        scheduleId: true,
      },
    });
    expect(prisma.schedule.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        title: '오늘 미팅',
        content: '회의 준비',
        scheduleTime: new Date('2026-06-29T08:00:00.000Z'),
        notificationEnabled: true,
        reminderOffsetMinutes: 60,
      },
      select: {
        id: true,
      },
    });
    expect(prisma.schedulePerson.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'user-1',
          scheduleId: 'schedule-1',
          personId: 'person-1',
        },
        {
          userId: 'user-1',
          scheduleId: 'schedule-1',
          personId: 'person-2',
        },
      ],
      skipDuplicates: true,
    });
    expect(prisma.record.update).toHaveBeenCalledWith({
      where: {
        id_userId: {
          id: 'record-1',
          userId: 'user-1',
        },
      },
      data: {
        scheduleId: 'schedule-1',
      },
    });
    expect(prisma.notificationJob.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        type: 'SCHEDULE',
        scheduleId: 'schedule-1',
        scheduledAt: new Date('2026-06-29T07:00:00.000Z'),
        dedupeKey: 'schedule:schedule-1',
      },
    });
  });

  it('creates a schedule without notification job when notification is disabled', async () => {
    prisma.person.findMany.mockResolvedValue([]);
    prisma.schedule.create.mockResolvedValue({
      id: 'schedule-1',
    });
    prisma.schedule.findFirst.mockResolvedValue({
      id: 'schedule-1',
      title: '오늘 미팅',
      scheduleTime: new Date('2026-06-29T08:00:00.000Z'),
      content: null,
      bookMark: false,
      notificationEnabled: false,
      reminderOffsetMinutes: 0,
      people: [],
    });

    await expect(
      service.createSchedule('user-1', {
        title: '오늘 미팅',
        scheduleTime: '2026-06-29T08:00:00.000Z',
        personIds: [],
        notificationEnabled: false,
        reminderOffsetMinutes: 0,
        content: null,
        recordId: null,
      }),
    ).resolves.toMatchObject({
      id: 'schedule-1',
      notificationEnabled: false,
      reminderOffsetMinutes: 0,
    });

    expect(prisma.schedulePerson.createMany).not.toHaveBeenCalled();
    expect(prisma.record.findFirst).not.toHaveBeenCalled();
    expect(prisma.record.update).not.toHaveBeenCalled();
    expect(prisma.notificationJob.create).not.toHaveBeenCalled();
  });

  it('throws bad request when a schedule person does not exist', async () => {
    prisma.person.findMany.mockResolvedValue([{ id: 'person-1' }]);

    await expect(
      service.createSchedule('user-1', {
        title: '오늘 미팅',
        scheduleTime: '2026-06-29T08:00:00.000Z',
        personIds: ['person-1', 'missing-person'],
        notificationEnabled: false,
        reminderOffsetMinutes: 0,
        content: null,
        recordId: null,
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'SCHEDULE_PERSON_NOT_FOUND',
        personIds: ['missing-person'],
      },
    });
  });

  it('throws bad request when the linked record is already linked to another schedule', async () => {
    prisma.person.findMany.mockResolvedValue([]);
    prisma.record.findFirst.mockResolvedValue({
      id: 'record-1',
      scheduleId: 'existing-schedule',
    });

    await expect(
      service.createSchedule('user-1', {
        title: '오늘 미팅',
        scheduleTime: '2026-06-29T08:00:00.000Z',
        personIds: [],
        notificationEnabled: false,
        reminderOffsetMinutes: 0,
        content: null,
        recordId: 'record-1',
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'SCHEDULE_RECORD_ALREADY_LINKED',
        recordId: 'record-1',
        scheduleId: 'existing-schedule',
      },
    });
  });

  it('updates schedule fields, replaces people, and reschedules notification job', async () => {
    prisma.schedule.findFirst
      .mockResolvedValueOnce({
        id: 'schedule-1',
      })
      .mockResolvedValueOnce({
        id: 'schedule-1',
        title: '수정된 미팅',
        scheduleTime: new Date('2026-06-30T08:00:00.000Z'),
        content: '수정된 내용',
        bookMark: true,
        notificationEnabled: true,
        reminderOffsetMinutes: 120,
        people: [
          {
            person: {
              id: 'person-2',
              name: '김영희',
              profileImageFile: null,
            },
          },
        ],
      });
    prisma.person.findMany.mockResolvedValue([
      {
        id: 'person-2',
      },
    ]);

    await expect(
      service.updateSchedule('user-1', 'schedule-1', {
        title: '수정된 미팅',
        scheduleTime: '2026-06-30T08:00:00.000Z',
        personIds: ['person-2'],
        content: '수정된 내용',
        bookMark: true,
        notificationEnabled: true,
        reminderOffsetMinutes: 120,
      }),
    ).resolves.toEqual({
      id: 'schedule-1',
      title: '수정된 미팅',
      scheduleTime: '2026-06-30T08:00:00.000Z',
      people: [
        {
          id: 'person-2',
          name: '김영희',
          image: null,
        },
      ],
      content: '수정된 내용',
      bookMark: true,
      notificationEnabled: true,
      reminderOffsetMinutes: 120,
    });

    expect(prisma.schedule.update).toHaveBeenCalledWith({
      where: {
        id_userId: {
          id: 'schedule-1',
          userId: 'user-1',
        },
      },
      data: {
        updatedAt: new Date('2026-06-29T01:00:00.000Z'),
        title: '수정된 미팅',
        scheduleTime: new Date('2026-06-30T08:00:00.000Z'),
        content: '수정된 내용',
        bookMark: true,
        notificationEnabled: true,
        reminderOffsetMinutes: 120,
      },
    });
    expect(prisma.schedulePerson.deleteMany).toHaveBeenCalledWith({
      where: {
        scheduleId: 'schedule-1',
        userId: 'user-1',
      },
    });
    expect(prisma.schedulePerson.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'user-1',
          scheduleId: 'schedule-1',
          personId: 'person-2',
        },
      ],
      skipDuplicates: true,
    });
    expect(prisma.notificationJob.upsert).toHaveBeenCalledWith({
      where: {
        userId_dedupeKey: {
          userId: 'user-1',
          dedupeKey: 'schedule:schedule-1',
        },
      },
      create: {
        userId: 'user-1',
        type: 'SCHEDULE',
        scheduleId: 'schedule-1',
        scheduledAt: new Date('2026-06-30T06:00:00.000Z'),
        dedupeKey: 'schedule:schedule-1',
      },
      update: {
        status: 'PENDING',
        scheduledAt: new Date('2026-06-30T06:00:00.000Z'),
        attemptCount: 0,
        sentAt: null,
        failedAt: null,
        lastAttemptAt: null,
        errorCode: null,
        errorMessage: null,
      },
    });
  });

  it('cancels pending notification job when schedule notification is disabled', async () => {
    prisma.schedule.findFirst
      .mockResolvedValueOnce({
        id: 'schedule-1',
      })
      .mockResolvedValueOnce({
        id: 'schedule-1',
        title: '오늘 미팅',
        scheduleTime: new Date('2026-06-29T08:00:00.000Z'),
        content: null,
        bookMark: false,
        notificationEnabled: false,
        reminderOffsetMinutes: 60,
        people: [],
      });

    await service.updateSchedule('user-1', 'schedule-1', {
      notificationEnabled: false,
    });

    expect(prisma.notificationJob.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        dedupeKey: 'schedule:schedule-1',
        status: 'PENDING',
      },
      data: {
        status: 'CANCELED',
      },
    });
    expect(prisma.notificationJob.upsert).not.toHaveBeenCalled();
  });

  it('updates only schedule bookmark', async () => {
    prisma.schedule.findFirst
      .mockResolvedValueOnce({
        id: 'schedule-1',
      })
      .mockResolvedValueOnce({
        id: 'schedule-1',
        title: '오늘 미팅',
        scheduleTime: new Date('2026-06-29T08:00:00.000Z'),
        content: null,
        bookMark: true,
        notificationEnabled: false,
        reminderOffsetMinutes: 60,
        people: [],
      });

    await expect(
      service.updateSchedule('user-1', 'schedule-1', {
        bookMark: true,
      }),
    ).resolves.toMatchObject({
      id: 'schedule-1',
      bookMark: true,
    });

    expect(prisma.schedule.update).toHaveBeenCalledWith({
      where: {
        id_userId: {
          id: 'schedule-1',
          userId: 'user-1',
        },
      },
      data: {
        updatedAt: new Date('2026-06-29T01:00:00.000Z'),
        bookMark: true,
      },
    });
    expect(prisma.schedulePerson.deleteMany).not.toHaveBeenCalled();
    expect(prisma.schedulePerson.createMany).not.toHaveBeenCalled();
  });

  it('deletes a schedule, related jobs and people links, and unlinks records', async () => {
    prisma.schedule.findFirst.mockResolvedValue({
      id: 'schedule-1',
    });
    prisma.schedule.deleteMany.mockResolvedValue({
      count: 1,
    });

    await expect(
      service.deleteSchedule('user-1', 'schedule-1'),
    ).resolves.toEqual({
      success: true,
    });

    expect(prisma.schedule.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'schedule-1',
        userId: 'user-1',
      },
      select: {
        id: true,
      },
    });
    expect(prisma.notificationJob.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        scheduleId: 'schedule-1',
      },
    });
    expect(prisma.schedulePerson.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        scheduleId: 'schedule-1',
      },
    });
    expect(prisma.record.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        scheduleId: 'schedule-1',
      },
      data: {
        scheduleId: null,
      },
    });
    expect(prisma.schedule.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'schedule-1',
        userId: 'user-1',
      },
    });
  });

  it('throws not found when deleting a missing schedule', async () => {
    prisma.schedule.findFirst.mockResolvedValue(null);

    await expect(
      service.deleteSchedule('user-1', 'missing-schedule'),
    ).rejects.toMatchObject({
      response: {
        code: 'SCHEDULE_NOT_FOUND',
        scheduleId: 'missing-schedule',
      },
    });

    expect(prisma.notificationJob.deleteMany).not.toHaveBeenCalled();
    expect(prisma.schedulePerson.deleteMany).not.toHaveBeenCalled();
    expect(prisma.record.updateMany).not.toHaveBeenCalled();
    expect(prisma.schedule.deleteMany).not.toHaveBeenCalled();
  });

  it('throws bad request when update payload is empty', async () => {
    await expect(
      service.updateSchedule('user-1', 'schedule-1', {}),
    ).rejects.toMatchObject({
      response: {
        code: 'SCHEDULE_UPDATE_EMPTY',
      },
    });
  });

  it('returns upcoming schedules with people and signed profile image URLs', async () => {
    prisma.schedule.findMany.mockResolvedValue([
      {
        id: 'schedule-1',
        title: '오늘 미팅',
        scheduleTime: new Date('2026-06-29T08:00:00.000Z'),
        bookMark: false,
        reminderOffsetMinutes: 0,
        people: [
          {
            person: {
              id: 'person-1',
              name: '홍길동',
              profileImageFile: {
                s3Key: 'profiles/profile.png',
              },
            },
          },
          {
            person: {
              id: 'person-2',
              name: '김영희',
              profileImageFile: null,
            },
          },
        ],
      },
      {
        id: 'schedule-2',
        title: '내일 점심',
        scheduleTime: new Date('2026-06-30T03:00:00.000Z'),
        bookMark: true,
        reminderOffsetMinutes: 60,
        people: [],
      },
    ]);

    await expect(service.getSchedules('user-1')).resolves.toEqual([
      {
        id: 'schedule-1',
        title: '오늘 미팅',
        people: [
          {
            id: 'person-1',
            name: '홍길동',
            image: 'https://signed.example.com/profiles/profile.png',
          },
          {
            id: 'person-2',
            name: '김영희',
            image: null,
          },
        ],
        scheduleTime: '2026-06-29T08:00:00.000Z',
        bookMark: false,
        dDay: 'D-0',
        reminderOffsetMinutes: 0,
      },
      {
        id: 'schedule-2',
        title: '내일 점심',
        people: [],
        scheduleTime: '2026-06-30T03:00:00.000Z',
        bookMark: true,
        dDay: 'D-1',
        reminderOffsetMinutes: 60,
      },
    ]);

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
        bookMark: true,
        reminderOffsetMinutes: true,
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
      },
      orderBy: [
        { bookMark: Prisma.SortOrder.desc },
        { scheduleTime: Prisma.SortOrder.asc },
      ],
    });
    expect(s3Service.getSignedUrl).toHaveBeenCalledWith('profiles/profile.png');
  });

  it('returns an empty array when there are no upcoming schedules', async () => {
    prisma.schedule.findMany.mockResolvedValue([]);

    await expect(service.getSchedules('user-1')).resolves.toEqual([]);
  });

  it('returns schedule detail with people and notification settings', async () => {
    prisma.schedule.findFirst.mockResolvedValue({
      id: 'schedule-1',
      title: '오늘 미팅',
      scheduleTime: new Date('2026-06-29T08:00:00.000Z'),
      content: null,
      bookMark: true,
      notificationEnabled: true,
      reminderOffsetMinutes: 60,
      people: [
        {
          person: {
            id: 'person-1',
            name: '홍길동',
            profileImageFile: {
              s3Key: 'profiles/profile.png',
            },
          },
        },
        {
          person: {
            id: 'person-2',
            name: '김영희',
            profileImageFile: null,
          },
        },
      ],
    });

    await expect(
      service.getScheduleDetail('user-1', 'schedule-1'),
    ).resolves.toEqual({
      id: 'schedule-1',
      title: '오늘 미팅',
      scheduleTime: '2026-06-29T08:00:00.000Z',
      people: [
        {
          id: 'person-1',
          name: '홍길동',
          image: 'https://signed.example.com/profiles/profile.png',
        },
        {
          id: 'person-2',
          name: '김영희',
          image: null,
        },
      ],
      content: null,
      bookMark: true,
      notificationEnabled: true,
      reminderOffsetMinutes: 60,
    });

    expect(prisma.schedule.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'schedule-1',
        userId: 'user-1',
      },
      select: {
        id: true,
        title: true,
        scheduleTime: true,
        content: true,
        bookMark: true,
        notificationEnabled: true,
        reminderOffsetMinutes: true,
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
      },
    });
  });

  it('throws not found when the schedule does not exist for the user', async () => {
    prisma.schedule.findFirst.mockResolvedValue(null);

    await expect(
      service.getScheduleDetail('user-1', 'schedule-1'),
    ).rejects.toMatchObject({
      response: {
        code: 'SCHEDULE_NOT_FOUND',
        scheduleId: 'schedule-1',
      },
    });
  });
});
