import {
  NotificationStatus,
  NotificationType,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FcmNotificationService } from './fcm-notification.service';
import { NotificationWorkerService } from './notification-worker.service';

interface PrismaMock {
  notificationJob: {
    findMany: jest.Mock;
    update: jest.Mock;
    upsert: jest.Mock;
  };
}

describe('NotificationWorkerService', () => {
  let prisma: PrismaMock;
  let fcmNotificationService: {
    sendScheduleNotification: jest.Mock;
    sendBirthdayNotification: jest.Mock;
  };
  let service: NotificationWorkerService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-05T12:00:00.000Z'));
    prisma = {
      notificationJob: {
        findMany: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
      },
    };
    fcmNotificationService = {
      sendScheduleNotification: jest.fn(),
      sendBirthdayNotification: jest.fn(),
    };
    service = new NotificationWorkerService(
      prisma as unknown as PrismaService,
      fcmNotificationService as unknown as FcmNotificationService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('processes due pending schedule notification jobs and marks success as sent', async () => {
    prisma.notificationJob.findMany.mockResolvedValue([
      {
        id: 'job-1',
        userId: 'user-1',
        type: NotificationType.SCHEDULE,
        dedupeKey: 'schedule:schedule-1',
        attemptCount: 0,
        person: null,
        schedule: {
          id: 'schedule-1',
          title: '오늘 미팅',
          scheduleTime: new Date('2026-07-05T13:00:00.000Z'),
        },
      },
    ]);
    fcmNotificationService.sendScheduleNotification.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      errorCode: null,
      errorMessage: null,
    });

    await service.processDueScheduleNotifications();

    expect(prisma.notificationJob.findMany).toHaveBeenCalledWith({
      where: {
        status: NotificationStatus.PENDING,
        type: {
          in: [NotificationType.SCHEDULE, NotificationType.BIRTHDAY],
        },
        scheduledAt: {
          lte: new Date('2026-07-05T12:00:00.000Z'),
        },
      },
      select: {
        id: true,
        userId: true,
        type: true,
        dedupeKey: true,
        attemptCount: true,
        schedule: {
          select: {
            id: true,
            title: true,
            scheduleTime: true,
          },
        },
        person: {
          select: {
            id: true,
            name: true,
            birthDate: true,
            birthdayNotificationOffsetMinutes: true,
          },
        },
      },
      orderBy: {
        scheduledAt: 'asc',
      },
      take: 20,
    });
    expect(
      fcmNotificationService.sendScheduleNotification,
    ).toHaveBeenCalledWith({
      userId: 'user-1',
      scheduleId: 'schedule-1',
      title: '오늘 미팅',
      body: expect.stringContaining('일정이 예정되어 있습니다.'),
    });
    expect(prisma.notificationJob.update).toHaveBeenCalledWith({
      where: {
        id: 'job-1',
      },
      data: {
        status: NotificationStatus.SENT,
        attemptCount: {
          increment: 1,
        },
        sentAt: new Date('2026-07-05T12:00:00.000Z'),
        failedAt: null,
        lastAttemptAt: new Date('2026-07-05T12:00:00.000Z'),
        errorCode: null,
        errorMessage: null,
      },
    });
  });

  it('marks job failed when there are no active push tokens', async () => {
    prisma.notificationJob.findMany.mockResolvedValue([
      {
        id: 'job-1',
        userId: 'user-1',
        type: NotificationType.SCHEDULE,
        dedupeKey: 'schedule:schedule-1',
        attemptCount: 0,
        person: null,
        schedule: {
          id: 'schedule-1',
          title: '오늘 미팅',
          scheduleTime: new Date('2026-07-05T13:00:00.000Z'),
        },
      },
    ]);
    fcmNotificationService.sendScheduleNotification.mockResolvedValue({
      successCount: 0,
      failureCount: 0,
      errorCode: 'NO_ACTIVE_PUSH_TOKENS',
      errorMessage: '활성 푸시 토큰이 없습니다.',
    });

    await service.processDueScheduleNotifications();

    expect(prisma.notificationJob.update).toHaveBeenCalledWith({
      where: {
        id: 'job-1',
      },
      data: {
        status: NotificationStatus.FAILED,
        attemptCount: {
          increment: 1,
        },
        failedAt: new Date('2026-07-05T12:00:00.000Z'),
        lastAttemptAt: new Date('2026-07-05T12:00:00.000Z'),
        errorCode: 'NO_ACTIVE_PUSH_TOKENS',
        errorMessage: '활성 푸시 토큰이 없습니다.',
      },
    });
  });

  it('marks job failed when the linked schedule is missing', async () => {
    prisma.notificationJob.findMany.mockResolvedValue([
      {
        id: 'job-1',
        userId: 'user-1',
        type: NotificationType.SCHEDULE,
        dedupeKey: 'schedule:schedule-1',
        attemptCount: 0,
        person: null,
        schedule: null,
      },
    ]);

    await service.processDueScheduleNotifications();

    expect(
      fcmNotificationService.sendScheduleNotification,
    ).not.toHaveBeenCalled();
    expect(prisma.notificationJob.update).toHaveBeenCalledWith({
      where: {
        id: 'job-1',
      },
      data: {
        status: NotificationStatus.FAILED,
        attemptCount: {
          increment: 1,
        },
        failedAt: new Date('2026-07-05T12:00:00.000Z'),
        lastAttemptAt: new Date('2026-07-05T12:00:00.000Z'),
        errorCode: 'SCHEDULE_NOT_FOUND',
        errorMessage: '알림을 보낼 일정을 찾을 수 없습니다.',
      },
    });
  });

  it('processes due pending birthday notification jobs and schedules next year', async () => {
    prisma.notificationJob.findMany.mockResolvedValue([
      {
        id: 'job-1',
        userId: 'user-1',
        type: NotificationType.BIRTHDAY,
        dedupeKey: 'birthday:person-1:2026',
        attemptCount: 0,
        schedule: null,
        person: {
          id: 'person-1',
          name: '홍길동',
          birthDate: new Date('1990-07-05T00:00:00.000Z'),
          birthdayNotificationOffsetMinutes: 60,
        },
      },
    ]);
    fcmNotificationService.sendBirthdayNotification.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      errorCode: null,
      errorMessage: null,
    });

    await service.processDueScheduleNotifications();

    expect(
      fcmNotificationService.sendBirthdayNotification,
    ).toHaveBeenCalledWith({
      userId: 'user-1',
      personId: 'person-1',
      title: '홍길동님 생일',
      body: '오늘은 홍길동님의 생일입니다.',
    });
    expect(prisma.notificationJob.update).toHaveBeenCalledWith({
      where: {
        id: 'job-1',
      },
      data: {
        status: NotificationStatus.SENT,
        attemptCount: {
          increment: 1,
        },
        sentAt: new Date('2026-07-05T12:00:00.000Z'),
        failedAt: null,
        lastAttemptAt: new Date('2026-07-05T12:00:00.000Z'),
        errorCode: null,
        errorMessage: null,
      },
    });
    expect(prisma.notificationJob.upsert).toHaveBeenCalledWith({
      where: {
        userId_dedupeKey: {
          userId: 'user-1',
          dedupeKey: 'birthday:person-1:2027',
        },
      },
      create: {
        userId: 'user-1',
        type: NotificationType.BIRTHDAY,
        personId: 'person-1',
        scheduledAt: new Date('2027-07-04T23:00:00.000Z'),
        dedupeKey: 'birthday:person-1:2027',
      },
      update: {
        status: NotificationStatus.PENDING,
        scheduledAt: new Date('2027-07-04T23:00:00.000Z'),
        attemptCount: 0,
        sentAt: null,
        failedAt: null,
        lastAttemptAt: null,
        errorCode: null,
        errorMessage: null,
      },
    });
  });
});
