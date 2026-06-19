import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Prisma, RefreshToken, User } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleLoginDto } from './dto/google-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { GoogleAuthService } from './google-auth.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

export interface AuthUserResponse {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
  role: string;
  isPremium: boolean;
}

export interface GoogleLoginResult {
  user: AuthUserResponse;
  accessToken: string;
  refreshToken: string;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

export interface LogoutResult {
  success: true;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly sessionService: SessionService,
    private readonly tokenService: TokenService,
  ) {}

  async loginWithGoogle(dto: GoogleLoginDto): Promise<GoogleLoginResult> {
    // 모바일 앱에서 받은 Google ID Token만 신뢰하고, 사용자 정보는 서버가 직접 검증해 추출한다.
    const profile = await this.googleAuthService.verifyIdToken(dto.idToken);
    const user = await this.resolveGoogleUser({
      email: profile.email,
      image: profile.image,
      name: profile.name,
      providerAccountId: profile.providerAccountId,
    });
    const familyId = randomUUID();
    const refreshToken = this.tokenService.createRefreshToken();
    const tokenHash = this.tokenService.hashRefreshToken(refreshToken);
    const expiresAt = this.tokenService.createRefreshTokenExpiresAt();
    const refreshTokenTtlSeconds =
      this.tokenService.getRefreshTokenTtlSeconds();

    // Redis set을 DB 세션 변경보다 먼저 수행해, Redis 장애가 기존 세션을 깨뜨리지 않게 한다.
    await this.sessionService.setPendingActiveSession(user.id, familyId);

    const activatedUser = await this.activateLoginSession({
      userId: user.id,
      familyId,
      tokenHash,
      expiresAt,
    });

    // DB 커밋 후 pending TTL을 refresh token 만료 시간으로 승격한다.
    await this.sessionService.promoteActiveSession(
      activatedUser.id,
      familyId,
      refreshTokenTtlSeconds,
    );

    return {
      user: this.toAuthUserResponse(activatedUser),
      accessToken: this.tokenService.signAccessToken({
        sub: activatedUser.id,
        familyId,
        role: activatedUser.role,
      }),
      refreshToken,
    };
  }

  async refresh(dto: RefreshTokenDto): Promise<RefreshResult> {
    // refresh token 원문은 저장하지 않고, 요청 때마다 hash로 비교한다.
    const tokenHash = this.tokenService.hashRefreshToken(dto.refreshToken);
    const refreshToken = await this.prisma.refreshToken.findUnique({
      where: {
        tokenHash,
      },
      include: {
        user: true,
      },
    });

    if (!refreshToken) {
      throw this.createInvalidRefreshTokenException();
    }

    if (refreshToken.revokedAt) {
      // 폐기된 refresh token 재사용은 탈취 가능성으로 보고 같은 family 전체를 폐기한다.
      await this.revokeRefreshTokenFamily(refreshToken);
      throw this.createInvalidRefreshTokenException();
    }

    if (refreshToken.expiresAt <= new Date()) {
      throw this.createInvalidRefreshTokenException();
    }

    await this.sessionService.assertActiveSession(
      refreshToken.userId,
      refreshToken.familyId,
    );

    // 같은 familyId를 유지하면서 refresh token만 회전해 단일 기기 세션을 이어간다.
    const nextRefreshToken = this.tokenService.createRefreshToken();
    const nextTokenHash = this.tokenService.hashRefreshToken(nextRefreshToken);
    const nextExpiresAt = this.tokenService.createRefreshTokenExpiresAt();
    const refreshTokenTtlSeconds =
      this.tokenService.getRefreshTokenTtlSeconds();

    const user = await this.rotateRefreshToken({
      currentTokenId: refreshToken.id,
      userId: refreshToken.userId,
      familyId: refreshToken.familyId,
      nextTokenHash,
      nextExpiresAt,
    });

    await this.sessionService.promoteActiveSession(
      user.id,
      refreshToken.familyId,
      refreshTokenTtlSeconds,
    );

    return {
      accessToken: this.tokenService.signAccessToken({
        sub: user.id,
        familyId: refreshToken.familyId,
        role: user.role,
      }),
      refreshToken: nextRefreshToken,
    };
  }

  async logout(dto: RefreshTokenDto): Promise<LogoutResult> {
    // 로그아웃은 idempotent하게 처리해 토큰 존재 여부를 외부에 노출하지 않는다.
    const tokenHash = this.tokenService.hashRefreshToken(dto.refreshToken);
    const refreshToken = await this.prisma.refreshToken.findUnique({
      where: {
        tokenHash,
      },
    });

    if (refreshToken) {
      await this.revokeRefreshTokenFamily(refreshToken);
    }

    return {
      success: true,
    };
  }

  private async resolveGoogleUser(profile: {
    providerAccountId: string;
    email?: string;
    name: string;
    image?: string;
  }): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      // Google sub를 Account의 providerAccountId로 사용해 이메일 변경에도 계정을 안정적으로 식별한다.
      const account = await tx.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: 'google',
            providerAccountId: profile.providerAccountId,
          },
        },
        include: {
          user: true,
        },
      });

      const user =
        account?.user ?? (await this.findOrCreateGoogleUser(tx, profile));

      return user;
    });
  }

  private async activateLoginSession(session: {
    userId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<User> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // 단일 기기 정책: 새 로그인 family가 활성화되면 기존 refresh token은 모두 폐기한다.
        await tx.refreshToken.updateMany({
          where: {
            userId: session.userId,
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
          },
        });

        await tx.refreshToken.create({
          data: {
            userId: session.userId,
            tokenHash: session.tokenHash,
            familyId: session.familyId,
            expiresAt: session.expiresAt,
          },
        });

        return tx.user.update({
          where: {
            id: session.userId,
          },
          data: {
            activeRefreshFamilyId: session.familyId,
          },
        });
      });
    } catch (error) {
      try {
        // DB 세션 활성화에 실패하면 pending Redis key를 제거해 잘못된 familyId가 오래 남지 않게 한다.
        await this.sessionService.deleteActiveSessionIfMatches(
          session.userId,
          session.familyId,
        );
      } catch (compensationError) {
        this.logger.error(
          'Failed to compensate pending active session after login transaction failure.',
          compensationError,
        );
      }

      throw error;
    }
  }

  private async findOrCreateGoogleUser(
    tx: Prisma.TransactionClient,
    profile: {
      providerAccountId: string;
      email?: string;
      name: string;
      image?: string;
    },
  ): Promise<User> {
    const existingUser = profile.email
      ? await tx.user.findUnique({
          where: {
            email: profile.email,
          },
        })
      : null;

    const user =
      existingUser ??
      (await tx.user.create({
        data: {
          email: profile.email,
          image: profile.image,
          name: profile.name,
        },
      }));

    await tx.account.create({
      data: {
        provider: 'google',
        providerAccountId: profile.providerAccountId,
        userId: user.id,
      },
    });

    return user;
  }

  private toAuthUserResponse(user: User): AuthUserResponse {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: user.role,
      isPremium: user.isPremium,
    };
  }

  private async rotateRefreshToken(rotation: {
    currentTokenId: string;
    userId: string;
    familyId: string;
    nextTokenHash: string;
    nextExpiresAt: Date;
  }): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      // revokedAt 조건을 함께 걸어 동시 refresh나 재사용이 한 번만 성공하도록 만든다.
      const updateResult = await tx.refreshToken.updateMany({
        where: {
          id: rotation.currentTokenId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      if (updateResult.count !== 1) {
        throw this.createInvalidRefreshTokenException();
      }

      await tx.refreshToken.create({
        data: {
          userId: rotation.userId,
          familyId: rotation.familyId,
          tokenHash: rotation.nextTokenHash,
          expiresAt: rotation.nextExpiresAt,
        },
      });

      return tx.user.findUniqueOrThrow({
        where: {
          id: rotation.userId,
        },
      });
    });
  }

  private async revokeRefreshTokenFamily(
    refreshToken: RefreshToken,
  ): Promise<void> {
    // family 단위 폐기는 refresh token 재사용 감지와 명시적 로그아웃에서 공통으로 사용한다.
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: {
          userId: refreshToken.userId,
          familyId: refreshToken.familyId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      }),
      this.prisma.user.updateMany({
        where: {
          id: refreshToken.userId,
          activeRefreshFamilyId: refreshToken.familyId,
        },
        data: {
          activeRefreshFamilyId: null,
        },
      }),
    ]);

    await this.sessionService.deleteActiveSessionIfMatches(
      refreshToken.userId,
      refreshToken.familyId,
    );
  }

  private createInvalidRefreshTokenException(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'INVALID_REFRESH_TOKEN',
      message: '유효하지 않은 refresh token입니다.',
    });
  }
}
