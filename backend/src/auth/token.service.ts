import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';

const DEFAULT_REFRESH_TOKEN_EXPIRES_DAYS = 30;
const SECONDS_PER_DAY = 24 * 60 * 60;

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  createRefreshToken(): string {
    return randomBytes(64).toString('base64url');
  }

  hashRefreshToken(refreshToken: string): string {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  createRefreshTokenExpiresAt(): Date {
    return new Date(Date.now() + this.getRefreshTokenTtlSeconds() * 1000);
  }

  getRefreshTokenTtlSeconds(): number {
    return this.getRefreshTokenExpiresDays() * SECONDS_PER_DAY;
  }

  private getRefreshTokenExpiresDays(): number {
    const rawValue = this.configService.get<string>(
      'REFRESH_TOKEN_EXPIRES_DAYS',
    );
    const parsedValue = rawValue ? Number(rawValue) : NaN;

    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      return DEFAULT_REFRESH_TOKEN_EXPIRES_DAYS;
    }

    return parsedValue;
  }
}
