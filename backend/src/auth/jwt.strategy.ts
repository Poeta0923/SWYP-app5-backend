import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { SessionService } from './session.service';
import type { JwtAccessPayload } from './types/jwt-access-payload.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly sessionService: SessionService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtAccessPayload): Promise<JwtAccessPayload> {
    if (!payload.sub || !payload.familyId) {
      throw new UnauthorizedException('Invalid access token payload.');
    }

    await this.sessionService.assertActiveSession(
      payload.sub,
      payload.familyId,
    );

    return payload;
  }
}
