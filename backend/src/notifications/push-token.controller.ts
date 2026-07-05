import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequiredAgreementsGuard } from '../agreements/required-agreements.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/types/jwt-access-payload.type';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { PushTokenEntity } from './entities/push-token.entity';
import { PushTokenService } from './push-token.service';

@ApiTags('push-tokens')
@Controller('push-tokens')
export class PushTokenController {
  constructor(private readonly pushTokenService: PushTokenService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'FCM 푸시 토큰 등록',
    description: '현재 사용자의 FCM registration token을 등록 또는 갱신합니다.',
  })
  @ApiBody({ type: RegisterPushTokenDto })
  @ApiCreatedResponse({
    description: '푸시 토큰 등록 성공',
    type: PushTokenEntity,
  })
  @ApiBadRequestResponse({
    description: '요청 body 검증 실패',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  @ApiForbiddenResponse({
    description: '필수 약관 미동의',
  })
  registerPushToken(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Body() dto: RegisterPushTokenDto,
  ) {
    return this.pushTokenService.registerPushToken(currentUser.sub, dto);
  }
}
