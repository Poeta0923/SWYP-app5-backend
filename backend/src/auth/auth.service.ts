import { Injectable } from '@nestjs/common';
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
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly sessionService: SessionService,
    private readonly tokenService: TokenService,
  ) {}

  async loginWithGoogle(dto: GoogleLoginDto): Promise<GoogleLoginResult> {
    const profile = await this.googleAuthService.verifyIdToken(dto.idToken);
    const familyId = randomUUID();
    const refreshToken = this.tokenService.createRefreshToken();
    const tokenHash = this.tokenService.hashRefreshToken(refreshToken);
    const expiresAt = this.tokenService.createRefreshTokenExpiresAt();
    const refreshTokenTtlSeconds = this.tokenService.getRefreshTokenTtlSeconds();

    const user = await this.prisma.$transaction(async (tx) => {
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
        account?.user ??
        (await this.findOrCreateGoogleUser(tx, {
          email: profile.email,
          image: profile.image,
          name: profile.name,
          providerAccountId: profile.providerAccountId,
        }));

      await tx.refreshToken.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash,
          familyId,
          expiresAt,
        },
      });

      return tx.user.update({
        where: {
          id: user.id,
        },
        data: {
          activeRefreshFamilyId: familyId,
        },
      });
    });

    await this.sessionService.setActiveSession(
      user.id,
      familyId,
      refreshTokenTtlSeconds,
    );

    return {
      user: this.toAuthUserResponse(user),
      refreshToken,
    };
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
