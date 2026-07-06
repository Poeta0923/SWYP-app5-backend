import { PrismaService } from '../prisma/prisma.service';
import { FcmNotificationService } from './fcm-notification.service';
import { FirebaseAdminService } from './firebase-admin.service';

interface PrismaMock {
  pushToken: {
    findMany: jest.Mock;
    update: jest.Mock;
  };
}

describe('FcmNotificationService', () => {
  let prisma: PrismaMock;
  let messaging: {
    sendEachForMulticast: jest.Mock;
  };
  let firebaseAdminService: {
    getMessaging: jest.Mock;
  };
  let service: FcmNotificationService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-05T12:00:00.000Z'));
    prisma = {
      pushToken: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };
    messaging = {
      sendEachForMulticast: jest.fn(),
    };
    firebaseAdminService = {
      getMessaging: jest.fn().mockReturnValue(messaging),
    };
    service = new FcmNotificationService(
      prisma as unknown as PrismaService,
      firebaseAdminService as unknown as FirebaseAdminService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends a schedule notification to active user push tokens', async () => {
    prisma.pushToken.findMany.mockResolvedValue([
      {
        id: 'push-token-1',
        token: 'fcm-token-1',
      },
      {
        id: 'push-token-2',
        token: 'fcm-token-2',
      },
    ]);
    messaging.sendEachForMulticast.mockResolvedValue({
      successCount: 2,
      failureCount: 0,
      responses: [{ success: true }, { success: true }],
    });

    await expect(
      service.sendScheduleNotification({
        userId: 'user-1',
        scheduleId: 'schedule-1',
        title: '오늘 미팅',
        body: '일정이 예정되어 있습니다.',
      }),
    ).resolves.toEqual({
      successCount: 2,
      failureCount: 0,
      errorCode: null,
      errorMessage: null,
    });

    expect(prisma.pushToken.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        revokedAt: null,
      },
      select: {
        id: true,
        token: true,
      },
    });
    expect(messaging.sendEachForMulticast).toHaveBeenCalledWith({
      tokens: ['fcm-token-1', 'fcm-token-2'],
      notification: {
        title: '오늘 미팅',
        body: '일정이 예정되어 있습니다.',
      },
      data: {
        type: 'SCHEDULE',
        scheduleId: 'schedule-1',
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
          },
        },
      },
    });
  });

  it('sends a birthday notification to active user push tokens', async () => {
    prisma.pushToken.findMany.mockResolvedValue([
      {
        id: 'push-token-1',
        token: 'fcm-token-1',
      },
    ]);
    messaging.sendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    });

    await expect(
      service.sendBirthdayNotification({
        userId: 'user-1',
        personId: 'person-1',
        title: '홍길동님 생일',
        body: '오늘은 홍길동님의 생일입니다.',
      }),
    ).resolves.toEqual({
      successCount: 1,
      failureCount: 0,
      errorCode: null,
      errorMessage: null,
    });

    expect(messaging.sendEachForMulticast).toHaveBeenCalledWith({
      tokens: ['fcm-token-1'],
      notification: {
        title: '홍길동님 생일',
        body: '오늘은 홍길동님의 생일입니다.',
      },
      data: {
        type: 'BIRTHDAY',
        personId: 'person-1',
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
          },
        },
      },
    });
  });

  it('revokes invalid push tokens from FCM send response', async () => {
    prisma.pushToken.findMany.mockResolvedValue([
      {
        id: 'push-token-1',
        token: 'fcm-token-1',
      },
      {
        id: 'push-token-2',
        token: 'fcm-token-2',
      },
    ]);
    messaging.sendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 1,
      responses: [
        { success: true },
        {
          success: false,
          error: {
            code: 'messaging/registration-token-not-registered',
            message: 'Requested entity was not found.',
          },
        },
      ],
    });

    await expect(
      service.sendScheduleNotification({
        userId: 'user-1',
        scheduleId: 'schedule-1',
        title: '오늘 미팅',
        body: '일정이 예정되어 있습니다.',
      }),
    ).resolves.toEqual({
      successCount: 1,
      failureCount: 1,
      errorCode: 'messaging/registration-token-not-registered',
      errorMessage: 'Requested entity was not found.',
    });

    expect(prisma.pushToken.update).toHaveBeenCalledWith({
      where: {
        id: 'push-token-2',
      },
      data: {
        revokedAt: new Date('2026-07-05T12:00:00.000Z'),
      },
    });
  });

  it('returns NO_ACTIVE_PUSH_TOKENS when the user has no active tokens', async () => {
    prisma.pushToken.findMany.mockResolvedValue([]);

    await expect(
      service.sendScheduleNotification({
        userId: 'user-1',
        scheduleId: 'schedule-1',
        title: '오늘 미팅',
        body: '일정이 예정되어 있습니다.',
      }),
    ).resolves.toEqual({
      successCount: 0,
      failureCount: 0,
      errorCode: 'NO_ACTIVE_PUSH_TOKENS',
      errorMessage: '활성 푸시 토큰이 없습니다.',
    });

    expect(messaging.sendEachForMulticast).not.toHaveBeenCalled();
  });
});
