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
    refreshToken: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
    account: {
      findUnique: jest.Mock;
    };
    user: {
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let googleAuthService: {
    verifyIdToken: jest.Mock;
  };
  let sessionService: {
    setPendingActiveSession: jest.Mock;
    promoteActiveSession: jest.Mock;
    deleteActiveSessionIfMatches: jest.Mock;
    deleteActiveSession: jest.Mock;
    assertActiveSession: jest.Mock;
  };
  let tokenService: {
    createRefreshToken: jest.Mock;
    hashRefreshToken: jest.Mock;
    createRefreshTokenExpiresAt: jest.Mock;
    getRefreshTokenTtlSeconds: jest.Mock;
    signAccessToken: jest.Mock;
  };
  let agreementsService: {
    getActiveAgreementStatuses: jest.Mock;
  };
  let resolveTx: {
    account: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
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
  let rotateTx: {
    refreshToken: {
      updateMany: jest.Mock;
      create: jest.Mock;
    };
    user: {
      findUniqueOrThrow: jest.Mock;
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
        create: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
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

    rotateTx = {
      refreshToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
      },
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(user),
      },
    };

    let transactionCallCount = 0;
    prisma = {
      refreshToken: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      account: {
        findUnique: jest.fn(),
      },
      user: {
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        transactionCallCount += 1;

        if (Array.isArray(callback)) {
          return Promise.all(callback);
        }

        if (transactionCallCount === 1) {
          callOrder.push('resolve-user-transaction');
          return callback(resolveTx);
        }

        if (transactionCallCount === 3) {
          return callback(rotateTx);
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
      deleteActiveSession: jest.fn().mockResolvedValue(undefined),
      assertActiveSession: jest.fn().mockResolvedValue(undefined),
    };

    tokenService = {
      createRefreshToken: jest
        .fn()
        .mockReturnValueOnce('refresh-token')
        .mockReturnValue('next-refresh-token'),
      hashRefreshToken: jest
        .fn()
        .mockReturnValueOnce('refresh-token-hash')
        .mockReturnValue('next-refresh-token-hash'),
      createRefreshTokenExpiresAt: jest.fn().mockReturnValue(new Date()),
      getRefreshTokenTtlSeconds: jest.fn().mockReturnValue(60 * 60 * 24 * 30),
      signAccessToken: jest.fn().mockReturnValue('access-token'),
    };
    agreementsService = {
      getActiveAgreementStatuses: jest.fn().mockResolvedValue([
        {
          type: 'TERMS',
          documentId: 'agreement-document-id',
          version: '0.0.1',
          title: '이용 약관 동의(필수)',
          required: true,
          agreed: false,
        },
      ]),
    };

    service = new AuthService(
      prisma as never,
      googleAuthService as never,
      sessionService as never,
      tokenService as never,
      agreementsService as never,
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
      agreements: [
        {
          type: 'TERMS',
          documentId: 'agreement-document-id',
          version: '0.0.1',
          title: '이용 약관 동의(필수)',
          required: true,
          agreed: false,
        },
      ],
      isNewUser: false,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    expect(agreementsService.getActiveAgreementStatuses).toHaveBeenCalledWith(
      user.id,
    );
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

  it('returns isNewUser true when a Google login creates a new user', async () => {
    const newUser = {
      ...user,
      id: 'user-2',
      email: 'new-user@example.com',
    };
    googleAuthService.verifyIdToken.mockResolvedValueOnce({
      providerAccountId: 'google-user-2',
      email: newUser.email,
      name: newUser.name,
      image: newUser.image,
    });
    resolveTx.account.findUnique.mockResolvedValueOnce(null);
    resolveTx.user.findUnique.mockResolvedValueOnce(null);
    resolveTx.user.create.mockResolvedValueOnce(newUser);
    activateTx.user.update.mockResolvedValueOnce({
      ...newUser,
      activeRefreshFamilyId: 'family-1',
    });

    const result = await service.loginWithGoogle({
      idToken: 'google-id-token',
    });

    expect(resolveTx.user.create).toHaveBeenCalledWith({
      data: {
        email: newUser.email,
        image: newUser.image,
        name: newUser.name,
      },
    });
    expect(resolveTx.account.create).toHaveBeenCalledWith({
      data: {
        provider: 'google',
        providerAccountId: 'google-user-2',
        userId: newUser.id,
      },
    });
    expect(result).toEqual({
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        image: newUser.image,
        role: newUser.role,
        isPremium: newUser.isPremium,
      },
      agreements: [
        {
          type: 'TERMS',
          documentId: 'agreement-document-id',
          version: '0.0.1',
          title: '이용 약관 동의(필수)',
          required: true,
          agreed: false,
        },
      ],
      isNewUser: true,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    expect(agreementsService.getActiveAgreementStatuses).toHaveBeenCalledWith(
      newUser.id,
    );
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

  it('rotates a valid refresh token and returns new tokens', async () => {
    prisma.$transaction.mockImplementation(async (callback) =>
      callback(rotateTx),
    );
    tokenService.createRefreshToken.mockReset();
    tokenService.createRefreshToken.mockReturnValue('next-refresh-token');
    tokenService.hashRefreshToken.mockReset();
    tokenService.hashRefreshToken
      .mockReturnValueOnce('refresh-token-hash')
      .mockReturnValue('next-refresh-token-hash');
    const expiresAt = new Date(Date.now() + 60_000);
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'refresh-token-id',
      userId: user.id,
      tokenHash: 'refresh-token-hash',
      familyId: 'family-1',
      expiresAt,
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      user,
    });

    const result = await service.refresh({ refreshToken: 'refresh-token' });

    expect(sessionService.assertActiveSession).toHaveBeenCalledWith(
      user.id,
      'family-1',
    );
    expect(rotateTx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'refresh-token-id',
        revokedAt: null,
      },
      data: {
        revokedAt: expect.any(Date),
      },
    });
    expect(rotateTx.refreshToken.create).toHaveBeenCalledWith({
      data: {
        userId: user.id,
        familyId: 'family-1',
        tokenHash: 'next-refresh-token-hash',
        expiresAt: expect.any(Date),
      },
    });
    expect(sessionService.promoteActiveSession).toHaveBeenCalledWith(
      user.id,
      'family-1',
      60 * 60 * 24 * 30,
    );
    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'next-refresh-token',
    });
  });

  it('rejects unknown refresh tokens', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(null);

    await expect(
      service.refresh({ refreshToken: 'unknown' }),
    ).rejects.toMatchObject({
      response: {
        code: 'INVALID_REFRESH_TOKEN',
      },
    });

    expect(sessionService.assertActiveSession).not.toHaveBeenCalled();
  });

  it('rejects expired refresh tokens', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'refresh-token-id',
      userId: user.id,
      tokenHash: 'refresh-token-hash',
      familyId: 'family-1',
      expiresAt: new Date(Date.now() - 1_000),
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      user,
    });

    await expect(
      service.refresh({ refreshToken: 'expired-refresh-token' }),
    ).rejects.toMatchObject({
      response: {
        code: 'INVALID_REFRESH_TOKEN',
      },
    });
  });

  it('revokes the refresh token family when a revoked refresh token is reused', async () => {
    prisma.$transaction.mockImplementation(async (operations) =>
      Promise.all(operations),
    );
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'refresh-token-id',
      userId: user.id,
      tokenHash: 'refresh-token-hash',
      familyId: 'family-1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      user,
    });

    await expect(
      service.refresh({ refreshToken: 'reused-refresh-token' }),
    ).rejects.toMatchObject({
      response: {
        code: 'INVALID_REFRESH_TOKEN',
      },
    });

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        userId: user.id,
        familyId: 'family-1',
        revokedAt: null,
      },
      data: {
        revokedAt: expect.any(Date),
      },
    });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: user.id,
        activeRefreshFamilyId: 'family-1',
      },
      data: {
        activeRefreshFamilyId: null,
      },
    });
    expect(sessionService.deleteActiveSessionIfMatches).toHaveBeenCalledWith(
      user.id,
      'family-1',
    );
  });

  it('revokes the refresh token family on logout and returns success', async () => {
    prisma.$transaction.mockImplementation(async (operations) =>
      Promise.all(operations),
    );
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'refresh-token-id',
      userId: user.id,
      tokenHash: 'refresh-token-hash',
      familyId: 'family-1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.logout({ refreshToken: 'refresh-token' });

    expect(result).toEqual({ success: true });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        userId: user.id,
        familyId: 'family-1',
        revokedAt: null,
      },
      data: {
        revokedAt: expect.any(Date),
      },
    });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: user.id,
        activeRefreshFamilyId: 'family-1',
      },
      data: {
        activeRefreshFamilyId: null,
      },
    });
    expect(sessionService.deleteActiveSessionIfMatches).toHaveBeenCalledWith(
      user.id,
      'family-1',
    );
  });

  it('returns success without mutating state when logout receives an unknown refresh token', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(null);

    const result = await service.logout({ refreshToken: 'unknown-token' });

    expect(result).toEqual({ success: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(sessionService.deleteActiveSessionIfMatches).not.toHaveBeenCalled();
  });

  it('returns success and still revokes the family when logout receives an already revoked refresh token', async () => {
    prisma.$transaction.mockImplementation(async (operations) =>
      Promise.all(operations),
    );
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'refresh-token-id',
      userId: user.id,
      tokenHash: 'refresh-token-hash',
      familyId: 'family-1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.logout({ refreshToken: 'revoked-token' });

    expect(result).toEqual({ success: true });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        userId: user.id,
        familyId: 'family-1',
        revokedAt: null,
      },
      data: {
        revokedAt: expect.any(Date),
      },
    });
    expect(sessionService.deleteActiveSessionIfMatches).toHaveBeenCalledWith(
      user.id,
      'family-1',
    );
  });

  it('deletes the current user when the reauthenticated Google account matches', async () => {
    prisma.$transaction.mockImplementation(async (callback) =>
      callback(prisma),
    );
    prisma.account.findUnique.mockResolvedValue({
      userId: user.id,
    });
    prisma.user.deleteMany.mockResolvedValue({ count: 1 });

    const result = await service.deleteAccount(
      { sub: user.id, familyId: 'family-1', role: user.role },
      { idToken: 'google-id-token' },
    );

    expect(googleAuthService.verifyIdToken).toHaveBeenCalledWith(
      'google-id-token',
    );
    expect(prisma.account.findUnique).toHaveBeenCalledWith({
      where: {
        provider_providerAccountId: {
          provider: 'google',
          providerAccountId: 'google-user-1',
        },
      },
      select: {
        userId: true,
      },
    });
    expect(prisma.user.deleteMany).toHaveBeenCalledWith({
      where: {
        id: user.id,
      },
    });
    expect(sessionService.deleteActiveSession).toHaveBeenCalledWith(user.id);
    expect(result).toEqual({ success: true });
  });

  it('rejects account deletion when the Google account does not exist', async () => {
    prisma.$transaction.mockImplementation(async (callback) =>
      callback(prisma),
    );
    prisma.account.findUnique.mockResolvedValue(null);

    await expect(
      service.deleteAccount(
        { sub: user.id, familyId: 'family-1', role: user.role },
        { idToken: 'google-id-token' },
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'GOOGLE_ACCOUNT_MISMATCH',
      },
    });

    expect(prisma.user.deleteMany).not.toHaveBeenCalled();
    expect(sessionService.deleteActiveSession).not.toHaveBeenCalled();
  });

  it('rejects account deletion when the Google account belongs to another user', async () => {
    prisma.$transaction.mockImplementation(async (callback) =>
      callback(prisma),
    );
    prisma.account.findUnique.mockResolvedValue({
      userId: 'user-2',
    });

    await expect(
      service.deleteAccount(
        { sub: user.id, familyId: 'family-1', role: user.role },
        { idToken: 'google-id-token' },
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'GOOGLE_ACCOUNT_MISMATCH',
      },
    });

    expect(prisma.user.deleteMany).not.toHaveBeenCalled();
    expect(sessionService.deleteActiveSession).not.toHaveBeenCalled();
  });

  it('does not delete the user when Google ID token verification fails', async () => {
    const verificationError = new Error('invalid google token');
    googleAuthService.verifyIdToken.mockRejectedValueOnce(verificationError);

    await expect(
      service.deleteAccount(
        { sub: user.id, familyId: 'family-1', role: user.role },
        { idToken: 'invalid-google-id-token' },
      ),
    ).rejects.toBe(verificationError);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.user.deleteMany).not.toHaveBeenCalled();
    expect(sessionService.deleteActiveSession).not.toHaveBeenCalled();
  });

  it('still returns success when the user was concurrently deleted after account verification', async () => {
    prisma.$transaction.mockImplementation(async (callback) =>
      callback(prisma),
    );
    prisma.account.findUnique.mockResolvedValue({
      userId: user.id,
    });
    prisma.user.deleteMany.mockResolvedValue({ count: 0 });

    const result = await service.deleteAccount(
      { sub: user.id, familyId: 'family-1', role: user.role },
      { idToken: 'google-id-token' },
    );

    expect(prisma.user.deleteMany).toHaveBeenCalledWith({
      where: {
        id: user.id,
      },
    });
    expect(sessionService.deleteActiveSession).toHaveBeenCalledWith(user.id);
    expect(result).toEqual({ success: true });
  });
});
