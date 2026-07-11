import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
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
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { DeleteScheduleDto } from './dto/delete-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import {
  ScheduleDetailEntity,
  ScheduleListItemEntity,
} from './entities/schedule.entity';
import { ScheduleService } from './schedule.service';

@ApiTags('schedule')
@Controller('schedule')
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '일정 생성',
    description:
      '현재 사용자의 일정을 생성하고, 알림이 활성화되어 있으면 발송 예약 job도 생성합니다.',
  })
  @ApiBody({ type: CreateScheduleDto })
  @ApiCreatedResponse({
    description: '일정 생성 성공',
    type: ScheduleDetailEntity,
  })
  @ApiBadRequestResponse({
    description: '요청 body 검증 실패 또는 연결할 인물/기록 오류',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  @ApiForbiddenResponse({
    description: '필수 약관 미동의',
  })
  createSchedule(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Body() dto: CreateScheduleDto,
  ) {
    return this.scheduleService.createSchedule(currentUser.sub, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '일정 목록 조회',
    description:
      '현재 사용자의 전체 일정 목록을 일정 시작 시각 오름차순으로 조회합니다.',
  })
  @ApiOkResponse({
    description: '일정 목록 조회 성공',
    type: ScheduleListItemEntity,
    isArray: true,
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  @ApiForbiddenResponse({
    description: '필수 약관 미동의',
  })
  getSchedules(@CurrentUser() currentUser: JwtAccessPayload) {
    return this.scheduleService.getSchedules(currentUser.sub);
  }

  @Get(':scheduleId')
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '일정 상세 조회',
    description: '현재 사용자의 일정 상세 정보를 조회합니다.',
  })
  @ApiOkResponse({
    description: '일정 상세 조회 성공',
    type: ScheduleDetailEntity,
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  @ApiForbiddenResponse({
    description: '필수 약관 미동의',
  })
  @ApiNotFoundResponse({
    description: '일정을 찾을 수 없음',
  })
  getScheduleDetail(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Param('scheduleId') scheduleId: string,
  ) {
    return this.scheduleService.getScheduleDetail(currentUser.sub, scheduleId);
  }

  @Patch(':scheduleId')
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '일정 수정',
    description:
      '일정 정보를 부분 수정합니다. 연결 인물 목록은 personIds가 전달되면 전체 교체합니다.',
  })
  @ApiBody({ type: UpdateScheduleDto })
  @ApiOkResponse({
    description: '일정 수정 성공',
    type: ScheduleDetailEntity,
  })
  @ApiBadRequestResponse({
    description: '요청 body 검증 실패 또는 연결할 인물 오류',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  @ApiForbiddenResponse({
    description: '필수 약관 미동의',
  })
  @ApiNotFoundResponse({
    description: '일정을 찾을 수 없음',
  })
  updateSchedule(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Param('scheduleId') scheduleId: string,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.scheduleService.updateSchedule(
      currentUser.sub,
      scheduleId,
      dto,
    );
  }

  @Delete()
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '일정 삭제',
    description:
      '현재 사용자의 일정을 삭제하고, 연결된 인물 관계와 알림 job을 함께 정리합니다.',
  })
  @ApiBody({ type: DeleteScheduleDto })
  @ApiOkResponse({
    description: '일정 삭제 성공',
    schema: {
      example: {
        success: true,
      },
    },
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
  @ApiNotFoundResponse({
    description: '일정을 찾을 수 없음',
  })
  deleteSchedule(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Body() dto: DeleteScheduleDto,
  ) {
    return this.scheduleService.deleteSchedule(currentUser.sub, dto.scheduleId);
  }
}
