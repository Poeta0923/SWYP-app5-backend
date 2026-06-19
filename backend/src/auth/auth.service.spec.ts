import { Logger } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const user = {
    id: 'user-1',
    name: '홍길동',
    email: 'user@example.com',
    image: null,
    role: 'USER',
    isPremium: false,
    activeRefreshFamilyId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let prisma: {
    $transaction: jest.Mock;
  };
  let googleAuthService: {
    verifyIdToken: jest.Mock;
  };
  let sessionService: {
    setPendingActiveSession: jest.Mock;
    promoteActiveSession: jest.Mock;
    deleteActiveSessionIfMatches: jest.Mock;
  };
  let tokenService: {
    createRefreshToken: jest.Mock;
    hashRefreshToken: jest.Mock;
    createRefreshTokenExpiresAt: jest.Mock;
    getRefreshTokenTtlSeconds: jest.Mock;
    signAccessToken: jest.Mock;
  };
  let resolveTx: {
    account: {
      findUnique: jest.Mock;
    };
  };
  let activateTx: {
    refreshToken: {
      updateMany: jest.Mock;
      create: jest.Mock;
    };
    user: {
      update: jest.Mock;
    };
  };
  let service: AuthService;
  let callOrder: string[];

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    callOrder = [];

    resolveTx = {
      account: {
        findUnique: jest.fn().mockResolvedValue({ user }),
      },
    };

    activateTx = {
      refreshToken: {
        updateMany: jest.fn().mockImplementation(async () => {
          callOrder.push('revoke-refresh-tokens');
        }),
        create: jest.fn().mockImplementation(async () => {
          callOrder.push('create-refresh-token');
        }),
      },
      user: {
        update: jest.fn().mockImplementation(async () => {
          callOrder.push('update-active-family');
          return { ...user, activeRefreshFamilyId: 'family-1' };
        }),
      },
    };

    let transactionCallCount = 0;
    prisma = {
      $transaction: jest.fn().mockImplementation(async (callback) => {
        transactionCallCount += 1;

        if (transactionCallCount === 1) {
          callOrder.push('resolve-user-transaction');
          return callback(resolveTx);
        }

        callOrder.push('activate-session-transaction');
        return callback(activateTx);
      }),
    };

    googleAuthService = {
      verifyIdToken: jest.fn().mockResolvedValue({
        providerAccountId: 'google-user-1',
        email: user.email,
        name: user.name,
        image: user.image,
      }),
    };

    sessionService = {
      setPendingActiveSession: jest.fn().mockImplementation(async () => {
        callOrder.push('set-pending-session');
      }),
      promoteActiveSession: jest.fn().mockImplementation(async () => {
        callOrder.push('promote-session');
      }),
      deleteActiveSessionIfMatches: jest.fn().mockResolvedValue(undefined),
    };

    tokenService = {
      createRefreshToken: jest.fn().mockReturnValue('refresh-token'),
      hashRefreshToken: jest.fn().mockReturnValue('refresh-token-hash'),
      createRefreshTokenExpiresAt: jest.fn().mockReturnValue(new Date()),
      getRefreshTokenTtlSeconds: jest.fn().mockReturnValue(60 * 60 * 24 * 30),
      signAccessToken: jest.fn().mockReturnValue('access-token'),
    };

    service = new AuthService(
      prisma as never,
      googleAuthService as never,
      sessionService as never,
      tokenService as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sets a pending Redis session before mutating session state in the database', async () => {
    const result = await service.loginWithGoogle({
      idToken: 'google-id-token',
    });

    expect(result).toEqual({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
        isPremium: user.isPremium,
      },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    expect(callOrder).toEqual([
      'resolve-user-transaction',
      'set-pending-session',
      'activate-session-transaction',
      'revoke-refresh-tokens',
      'create-refresh-token',
      'update-active-family',
      'promote-session',
    ]);
  });

  it('does not mutate session state when pending Redis session activation fails', async () => {
    sessionService.setPendingActiveSession.mockRejectedValueOnce(
      new Error('redis unavailable'),
    );

    await expect(
      service.loginWithGoogle({ idToken: 'google-id-token' }),
    ).rejects.toThrow('redis unavailable');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(activateTx.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(sessionService.promoteActiveSession).not.toHaveBeenCalled();
  });

  it('deletes the pending Redis session and preserves the original error when database activation fails', async () => {
    const databaseError = new Error('database failed');
    let transactionCallCount = 0;
    prisma.$transaction.mockImplementation(async (callback) => {
      transactionCallCount += 1;

      if (transactionCallCount === 1) {
        return callback(resolveTx);
      }

      throw databaseError;
    });
    sessionService.deleteActiveSessionIfMatches.mockRejectedValueOnce(
      new Error('delete failed'),
    );

    await expect(
      service.loginWithGoogle({ idToken: 'google-id-token' }),
    ).rejects.toBe(databaseError);

    expect(sessionService.deleteActiveSessionIfMatches).toHaveBeenCalledWith(
      user.id,
      expect.any(String),
    );
    expect(sessionService.promoteActiveSession).not.toHaveBeenCalled();
  });
});
