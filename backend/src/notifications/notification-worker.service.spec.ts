import { NotificationStatus, NotificationType } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FcmNotificationService } from './fcm-notification.service';
import { NotificationWorkerService } from './notification-worker.service';

interface PrismaMock {
  notificationJob: {
    findMany: jest.Mock;
    update: jest.Mock;
  };
}

describe('NotificationWorkerService', () => {
  let prisma: PrismaMock;
  let fcmNotificationService: {
    sendScheduleNotification: jest.Mock;
  };
  let service: NotificationWorkerService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-05T12:00:00.000Z'));
    prisma = {
      notificationJob: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };
    fcmNotificationService = {
      sendScheduleNotification: jest.fn(),
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
        attemptCount: 0,
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
        type: NotificationType.SCHEDULE,
        scheduledAt: {
          lte: new Date('2026-07-05T12:00:00.000Z'),
        },
      },
      select: {
        id: true,
        userId: true,
        attemptCount: true,
        schedule: {
          select: {
            id: true,
            title: true,
            scheduleTime: true,
          },
        },
      },
      orderBy: {
        scheduledAt: 'asc',
      },
      take: 20,
    });
    expect(fcmNotificationService.sendScheduleNotification).toHaveBeenCalledWith(
      {
        userId: 'user-1',
        scheduleId: 'schedule-1',
        title: '오늘 미팅',
        body: expect.stringContaining('일정이 예정되어 있습니다.'),
      },
    );
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
        attemptCount: 0,
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
        attemptCount: 0,
        schedule: null,
      },
    ]);

    await service.processDueScheduleNotifications();

    expect(fcmNotificationService.sendScheduleNotification).not.toHaveBeenCalled();
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
});
