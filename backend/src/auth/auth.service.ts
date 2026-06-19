import { Injectable } from '@nestjs/common';
import type { User } from '../../generated/prisma/client';
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

    const account = await this.prisma.account.findUnique({
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

    if (account) {
      return {
        user: this.toAuthUserResponse(account.user),
      };
    }

    const existingUser = profile.email
      ? await this.prisma.user.findUnique({
          where: {
            email: profile.email,
          },
        })
      : null;

    const user =
      existingUser ??
      (await this.prisma.user.create({
        data: {
          email: profile.email,
          image: profile.image,
          name: profile.name,
        },
      }));

    await this.prisma.account.create({
      data: {
        provider: 'google',
        providerAccountId: profile.providerAccountId,
        userId: user.id,
      },
    });

    return {
      user: this.toAuthUserResponse(user),
    };
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
