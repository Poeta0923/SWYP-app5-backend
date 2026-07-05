import { PrismaService } from '../prisma/prisma.service';
import { PushTokenService } from './push-token.service';

interface PrismaMock {
  pushToken: {
    upsert: jest.Mock;
  };
}

describe('PushTokenService', () => {
  let prisma: PrismaMock;
  let service: PushTokenService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-05T12:00:00.000Z'));
    prisma = {
      pushToken: {
        upsert: jest.fn(),
      },
    };
    service = new PushTokenService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('upserts a new push token for the current user', async () => {
    prisma.pushToken.upsert.mockResolvedValue({
      id: 'push-token-1',
      platform: 'ANDROID',
      lastSeenAt: new Date('2026-07-05T12:00:00.000Z'),
    });

    await expect(
      service.registerPushToken('user-1', {
        token: 'fcm-token',
        platform: 'ANDROID',
      }),
    ).resolves.toEqual({
      id: 'push-token-1',
      platform: 'ANDROID',
      lastSeenAt: '2026-07-05T12:00:00.000Z',
    });

    expect(prisma.pushToken.upsert).toHaveBeenCalledWith({
      where: {
        token: 'fcm-token',
      },
      create: {
        userId: 'user-1',
        token: 'fcm-token',
        platform: 'ANDROID',
        revokedAt: null,
        lastSeenAt: new Date('2026-07-05T12:00:00.000Z'),
      },
      update: {
        userId: 'user-1',
        platform: 'ANDROID',
        revokedAt: null,
        lastSeenAt: new Date('2026-07-05T12:00:00.000Z'),
      },
      select: {
        id: true,
        platform: true,
        lastSeenAt: true,
      },
    });
  });

  it('allows platform to be omitted and preserves existing platform on update', async () => {
    prisma.pushToken.upsert.mockResolvedValue({
      id: 'push-token-1',
      platform: null,
      lastSeenAt: new Date('2026-07-05T12:00:00.000Z'),
    });

    await service.registerPushToken('user-1', {
      token: 'fcm-token',
    });

    expect(prisma.pushToken.upsert).toHaveBeenCalledWith({
      where: {
        token: 'fcm-token',
      },
      create: {
        userId: 'user-1',
        token: 'fcm-token',
        platform: null,
        revokedAt: null,
        lastSeenAt: new Date('2026-07-05T12:00:00.000Z'),
      },
      update: {
        userId: 'user-1',
        revokedAt: null,
        lastSeenAt: new Date('2026-07-05T12:00:00.000Z'),
      },
      select: {
        id: true,
        platform: true,
        lastSeenAt: true,
      },
    });
  });
});
