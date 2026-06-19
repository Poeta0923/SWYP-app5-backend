import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import type { JwtAccessPayload } from './types/jwt-access-payload.type';

const DEFAULT_REFRESH_TOKEN_EXPIRES_DAYS = 30;
const DEFAULT_ACCESS_TOKEN_EXPIRES_IN = '15m';
const SECONDS_PER_DAY = 24 * 60 * 60;

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  signAccessToken(payload: JwtAccessPayload): string {
    return this.jwtService.sign(payload, {
      expiresIn: this.getAccessTokenExpiresIn(),
    });
  }

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

  private getAccessTokenExpiresIn(): JwtSignOptions['expiresIn'] {
    return (this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ??
      DEFAULT_ACCESS_TOKEN_EXPIRES_IN) as JwtSignOptions['expiresIn'];
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
