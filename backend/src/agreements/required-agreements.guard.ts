import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { JwtAccessPayload } from '../auth/types/jwt-access-payload.type';
import { AgreementsService } from './agreements.service';

type AuthenticatedRequest = Request & {
  user?: JwtAccessPayload;
};

@Injectable()
export class RequiredAgreementsGuard implements CanActivate {
  constructor(private readonly agreementsService: AgreementsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException({
        code: 'AUTHENTICATED_USER_REQUIRED',
        message: '인증된 사용자 정보가 필요합니다.',
      });
    }

    const hasAgreedAllRequiredAgreements =
      await this.agreementsService.hasAgreedAllRequiredAgreements(user.sub);

    if (!hasAgreedAllRequiredAgreements) {
      throw new ForbiddenException({
        code: 'REQUIRED_AGREEMENTS_NOT_ACCEPTED',
        message: '필수 약관 동의가 필요합니다.',
      });
    }

    return true;
  }
}
