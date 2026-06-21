import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtAccessPayload } from './types/jwt-access-payload.type';

type AuthenticatedRequest = Request & {
  user?: JwtAccessPayload;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtAccessPayload => {
    // Passport JwtStrategy.validate()가 반환한 payload는 Nest가 request.user에 넣어준다.
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    return request.user as JwtAccessPayload;
  },
);
