import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AgreementsService } from './agreements.service';
import { AgreementDocumentEntity } from './entities/agreement-document.entity';

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
}
