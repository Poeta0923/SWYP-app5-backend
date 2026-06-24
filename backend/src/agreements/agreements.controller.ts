import { Controller, Get } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AgreementsService } from './agreements.service';
import { AgreementDocumentEntity } from './entities/agreement-document.entity';

@ApiTags('agreements')
@Controller('agreements')
export class AgreementsController {
  constructor(private readonly agreementsService: AgreementsService) {}

  @Get('privacy-required')
  @ApiOperation({ summary: '현재 유효한 필수 개인정보 약관 조회' })
  @ApiOkResponse({
    description: '필수 개인정보 약관 조회 성공',
    type: AgreementDocumentEntity,
  })
  @ApiNotFoundResponse({
    description: '현재 유효한 필수 개인정보 약관 없음',
  })
  getActivePrivacyRequiredAgreement() {
    return this.agreementsService.getActivePrivacyRequiredAgreement();
  }
}
