import { NotificationType } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';

interface PrismaMock {
  notification: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
}

describe('NotificationService', () => {
  let prisma: PrismaMock;
  let service: NotificationService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-05T12:00:00.000Z'));
    prisma = {
      notification: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new NotificationService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns user notifications ordered by sent time descending', async () => {
    prisma.notification.findMany.mockResolvedValue([
      {
        id: 'notification-2',
        type: NotificationType.BIRTHDAY,
        title: '홍길동님 생일',
        body: '오늘은 홍길동님의 생일입니다.',
        data: {
          type: 'BIRTHDAY',
          personId: 'person-1',
        },
        scheduleId: null,
        personId: 'person-1',
        sentAt: new Date('2026-07-05T12:00:00.000Z'),
        readAt: new Date('2026-07-05T12:05:00.000Z'),
      },
      {
        id: 'notification-1',
        type: NotificationType.SCHEDULE,
        title: '오늘 미팅',
        body: '일정이 예정되어 있습니다.',
        data: {
          type: 'SCHEDULE',
          scheduleId: 'schedule-1',
        },
        scheduleId: 'schedule-1',
        personId: null,
        sentAt: new Date('2026-07-05T11:00:00.000Z'),
        readAt: null,
      },
    ]);

    await expect(service.getNotifications('user-1')).resolves.toEqual([
      {
        id: 'notification-2',
        type: NotificationType.BIRTHDAY,
        title: '홍길동님 생일',
        body: '오늘은 홍길동님의 생일입니다.',
        data: {
          type: 'BIRTHDAY',
          personId: 'person-1',
        },
        scheduleId: null,
        personId: 'person-1',
        sentAt: '2026-07-05T12:00:00.000Z',
        readAt: '2026-07-05T12:05:00.000Z',
        isRead: true,
      },
      {
        id: 'notification-1',
        type: NotificationType.SCHEDULE,
        title: '오늘 미팅',
        body: '일정이 예정되어 있습니다.',
        data: {
          type: 'SCHEDULE',
          scheduleId: 'schedule-1',
        },
        scheduleId: 'schedule-1',
        personId: null,
        sentAt: '2026-07-05T11:00:00.000Z',
        readAt: null,
        isRead: false,
      },
    ]);

    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
      },
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        data: true,
        scheduleId: true,
        personId: true,
        sentAt: true,
        readAt: true,
      },
      orderBy: {
        sentAt: 'desc',
      },
    });
  });

  it('marks a notification as read', async () => {
    prisma.notification.findFirst.mockResolvedValue({
      id: 'notification-1',
      readAt: null,
    });
    prisma.notification.update.mockResolvedValue({
      id: 'notification-1',
      type: NotificationType.SCHEDULE,
      title: '오늘 미팅',
      body: '일정이 예정되어 있습니다.',
      data: {
        type: 'SCHEDULE',
        scheduleId: 'schedule-1',
      },
      scheduleId: 'schedule-1',
      personId: null,
      sentAt: new Date('2026-07-05T11:00:00.000Z'),
      readAt: new Date('2026-07-05T12:00:00.000Z'),
    });

    await expect(
      service.markNotificationAsRead('user-1', 'notification-1'),
    ).resolves.toEqual({
      id: 'notification-1',
      type: NotificationType.SCHEDULE,
      title: '오늘 미팅',
      body: '일정이 예정되어 있습니다.',
      data: {
        type: 'SCHEDULE',
        scheduleId: 'schedule-1',
      },
      scheduleId: 'schedule-1',
      personId: null,
      sentAt: '2026-07-05T11:00:00.000Z',
      readAt: '2026-07-05T12:00:00.000Z',
      isRead: true,
    });

    expect(prisma.notification.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'notification-1',
        userId: 'user-1',
      },
      select: {
        id: true,
        readAt: true,
      },
    });
    expect(prisma.notification.update).toHaveBeenCalledWith({
      where: {
        id: 'notification-1',
      },
      data: {
        readAt: new Date('2026-07-05T12:00:00.000Z'),
      },
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        data: true,
        scheduleId: true,
        personId: true,
        sentAt: true,
        readAt: true,
      },
    });
  });

  it('keeps the existing read time when the notification was already read', async () => {
    const readAt = new Date('2026-07-05T11:30:00.000Z');
    prisma.notification.findFirst.mockResolvedValue({
      id: 'notification-1',
      readAt,
    });
    prisma.notification.update.mockResolvedValue({
      id: 'notification-1',
      type: NotificationType.SCHEDULE,
      title: '오늘 미팅',
      body: '일정이 예정되어 있습니다.',
      data: null,
      scheduleId: 'schedule-1',
      personId: null,
      sentAt: new Date('2026-07-05T11:00:00.000Z'),
      readAt,
    });

    await service.markNotificationAsRead('user-1', 'notification-1');

    expect(prisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          readAt,
        },
      }),
    );
  });

  it('throws not found when marking a missing notification as read', async () => {
    prisma.notification.findFirst.mockResolvedValue(null);

    await expect(
      service.markNotificationAsRead('user-1', 'missing-notification'),
    ).rejects.toMatchObject({
      response: {
        code: 'NOTIFICATION_NOT_FOUND',
        notificationId: 'missing-notification',
      },
    });

    expect(prisma.notification.update).not.toHaveBeenCalled();
  });
});
