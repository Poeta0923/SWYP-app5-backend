import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Prisma, User } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleLoginDto } from './dto/google-login.dto';
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

    await this.sessionService.setPendingActiveSession(user.id, familyId);

    const activatedUser = await this.activateLoginSession({
      userId: user.id,
      familyId,
      tokenHash,
      expiresAt,
    });

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

  private async resolveGoogleUser(profile: {
    providerAccountId: string;
    email?: string;
    name: string;
    image?: string;
  }): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
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
}
