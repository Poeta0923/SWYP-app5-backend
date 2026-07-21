import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { GOOGLE_PLAY_RTDN_SECRET_ENV } from './billing.constants';

/**
 * RTDN 웹훅 보호 가드. Pub/Sub push URL에 붙인 ?token= 값을 서버 시크릿과 대조한다.
 * JWT가 아니라 공유 시크릿 방식이라 별도 가드로 둔다.
 */
@Injectable()
export class GooglePlayRtdnSecretGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.configService.getOrThrow<string>(
      GOOGLE_PLAY_RTDN_SECRET_ENV,
    );
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.query.token;

    if (typeof token !== 'string' || token !== secret) {
      throw new UnauthorizedException('Invalid RTDN token.');
    }
    return true;
  }
}
