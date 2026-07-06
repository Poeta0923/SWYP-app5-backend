import { ApiProperty } from '@nestjs/swagger';
import { AgreementType } from '../../../generated/prisma/client';
import type { AgreementStatusResponse } from '../agreements.service';

export class AgreementStatusEntity implements AgreementStatusResponse {
  @ApiProperty({
    enum: AgreementType,
    example: AgreementType.TERMS_OF_SERVICE,
    description: '약관 유형',
  })
  type: AgreementType;

  @ApiProperty({
    example: 'clx0000000000000000000001',
    description: '약관 문서 ID',
  })
  documentId: string;

  @ApiProperty({
    example: '0.0.1',
    description: '약관 버전',
  })
  version: string;

  @ApiProperty({
    example: '이용 약관 동의(필수)',
    description: '약관 제목',
  })
  title: string;

  @ApiProperty({
    example: true,
    description: '필수 동의 여부',
  })
  required: boolean;

  @ApiProperty({
    example: true,
    description: '사용자 동의 여부',
  })
  agreed: boolean;
}
