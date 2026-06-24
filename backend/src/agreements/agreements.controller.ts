import { Controller, Get, Param, ParseEnumPipe } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AgreementType } from '../../generated/prisma/client';
import { AgreementsService } from './agreements.service';
import { AgreementDocumentEntity } from './entities/agreement-document.entity';

@ApiTags('agreements')
@Controller('agreements')
export class AgreementsController {
  constructor(private readonly agreementsService: AgreementsService) {}

  @Get(':type')
  @ApiOperation({ summary: '현재 유효한 약관 조회' })
  @ApiParam({
    name: 'type',
    enum: AgreementType,
    description: '조회할 약관 유형',
  })
  @ApiOkResponse({
    description: '약관 조회 성공',
    type: AgreementDocumentEntity,
  })
  @ApiNotFoundResponse({
    description: '현재 유효한 약관 없음',
  })
  getActiveAgreement(
    @Param('type', new ParseEnumPipe(AgreementType)) type: AgreementType,
  ) {
    return this.agreementsService.getActiveAgreement(type);
  }
}
