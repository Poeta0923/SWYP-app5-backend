import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequiredAgreementsGuard } from '../agreements/required-agreements.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/types/jwt-access-payload.type';
import { NotificationEntity } from './entities/notification.entity';
import { NotificationService } from './notification.service';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '알림 목록 조회',
    description:
      '현재 사용자의 발송된 알림 목록을 발송 시각 내림차순으로 조회합니다.',
  })
  @ApiOkResponse({
    description: '알림 목록 조회 성공',
    type: NotificationEntity,
    isArray: true,
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  @ApiForbiddenResponse({
    description: '필수 약관 미동의',
  })
  getNotifications(@CurrentUser() currentUser: JwtAccessPayload) {
    return this.notificationService.getNotifications(currentUser.sub);
  }

  @Patch(':notificationId/read')
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '알림 읽음 처리',
    description: '현재 사용자의 알림을 읽음 상태로 변경합니다.',
  })
  @ApiOkResponse({
    description: '알림 읽음 처리 성공',
    type: NotificationEntity,
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  @ApiForbiddenResponse({
    description: '필수 약관 미동의',
  })
  @ApiNotFoundResponse({
    description: '알림을 찾을 수 없음',
  })
  markNotificationAsRead(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Param('notificationId') notificationId: string,
  ) {
    return this.notificationService.markNotificationAsRead(
      currentUser.sub,
      notificationId,
    );
  }
}
