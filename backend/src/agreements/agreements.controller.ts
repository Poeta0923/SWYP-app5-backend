import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/types/jwt-access-payload.type';
import { AgreementsService } from './agreements.service';
import { AgreeAgreementsDto } from './dto/agree-agreements.dto';
import { UpdateAgreementConsentDto } from './dto/update-agreement-consent.dto';
import { AgreementDocumentEntity } from './entities/agreement-document.entity';
import { AgreementStatusEntity } from './entities/agreement-status.entity';

@ApiTags('agreements')
@Controller('agreements')
export class AgreementsController {
  constructor(private readonly agreementsService: AgreementsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '현재 유효한 모든 약관 조회' })
  @ApiOkResponse({
    description: '약관 목록 조회 성공',
    type: AgreementDocumentEntity,
    isArray: true,
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  getActiveAgreements() {
    return this.agreementsService.getActiveAgreements();
  }

  @Post('consents')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '약관 동의 저장' })
  @ApiBody({ type: AgreeAgreementsDto })
  @ApiOkResponse({
    description: '약관 동의 저장 성공',
    type: AgreementStatusEntity,
    isArray: true,
  })
  @ApiBadRequestResponse({
    description: '요청 body 검증 실패',
  })
  @ApiConflictResponse({
    description: '약관 변경으로 재로그인 필요',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  agreeAgreements(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Body() dto: AgreeAgreementsDto,
    @Req() request: Request,
  ) {
    return this.agreementsService.agreeAgreements({
      userId: currentUser.sub,
      agreementDocumentIds: dto.agreementDocumentIds,
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    });
  }

  @Patch('consents')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '선택 약관 동의 상태 변경' })
  @ApiBody({ type: UpdateAgreementConsentDto })
  @ApiOkResponse({
    description: '선택 약관 동의 상태 변경 성공',
    type: AgreementStatusEntity,
    isArray: true,
  })
  @ApiBadRequestResponse({
    description: '요청 body 검증 실패 또는 필수 약관 변경 요청',
  })
  @ApiConflictResponse({
    description: '약관 변경으로 재로그인 필요',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  updateAgreementConsent(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Body() dto: UpdateAgreementConsentDto,
    @Req() request: Request,
  ) {
    return this.agreementsService.updateAgreementConsent({
      userId: currentUser.sub,
      agreementDocumentId: dto.agreementDocumentId,
      agreed: dto.agreed,
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    });
  }
}
