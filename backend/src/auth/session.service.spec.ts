import { UnauthorizedException } from '@nestjs/common';
import { SessionService } from './session.service';

describe('SessionService', () => {
  let prisma: {
    user: {
      findUnique: jest.Mock;
    };
    refreshToken: {
      findFirst: jest.Mock;
    };
  };
  let redisClient: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
  };
  let redisService: {
    isReady: jest.Mock;
    getClient: jest.Mock;
  };
  let service: SessionService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
      refreshToken: {
        findFirst: jest.fn(),
      },
    };
    redisClient = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };
    redisService = {
      isReady: jest.fn().mockReturnValue(true),
      getClient: jest.fn().mockReturnValue(redisClient),
    };
    service = new SessionService(prisma as never, redisService as never);
  });

  it('stores pending active sessions with a short TTL', async () => {
    await service.setPendingActiveSession('user-1', 'family-1');

    expect(redisClient.set).toHaveBeenCalledWith(
      'auth:active-session:user-1',
      'family-1',
      'EX',
      60,
    );
  });

  it('rehydrates Redis from the database when the active session key is missing', async () => {
    redisClient.get.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({
      activeRefreshFamilyId: 'family-1',
    });
    prisma.refreshToken.findFirst.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
    });

    await service.assertActiveSession('user-1', 'family-1');

    expect(redisClient.set).toHaveBeenCalledWith(
      'auth:active-session:user-1',
      'family-1',
      'EX',
      expect.any(Number),
    );
  });

  it('does not use database fallback when Redis contains a stale session value', async () => {
    redisClient.get.mockResolvedValue('old-family');

    await expect(
      service.assertActiveSession('user-1', 'family-1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.refreshToken.findFirst).not.toHaveBeenCalled();
  });

  it('deletes an active session only when it still matches the issued family', async () => {
    redisClient.get.mockResolvedValue('family-1');

    await service.deleteActiveSessionIfMatches('user-1', 'family-1');

    expect(redisClient.del).toHaveBeenCalledWith('auth:active-session:user-1');
  });
});
