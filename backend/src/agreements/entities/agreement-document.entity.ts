import { ApiProperty } from '@nestjs/swagger';
import {
  AgreementType,
  type AgreementDocument,
} from '../../../generated/prisma/client';

export class AgreementDocumentEntity implements AgreementDocument {
  @ApiProperty({
    example: 'clx0000000000000000000000',
    description: '약관 문서 ID',
  })
  id: string;

  @ApiProperty({
    enum: AgreementType,
    example: AgreementType.PRIVACY_COLLECTION_AND_PROCESSING_CONSENT,
    description: '약관 유형',
  })
  type: AgreementType;

  @ApiProperty({
    example: '2026.06.24',
    description: '약관 버전',
  })
  version: string;

  @ApiProperty({
    example: '개인정보 처리방침',
    description: '약관 제목',
  })
  title: string;

  @ApiProperty({
    example: '개인정보 처리방침 본문입니다.',
    description: '약관 본문',
  })
  content: string;

  @ApiProperty({
    example: 'sha256-content-hash',
    description: '약관 본문 해시',
  })
  contentHash: string;

  @ApiProperty({
    example: true,
    description: '현재 사용자 동의 여부',
  })
  agreed: boolean;

  @ApiProperty({
    example: true,
    description: '필수 동의 여부',
  })
  required: boolean;

  @ApiProperty({
    example: '2026-06-24T00:00:00.000Z',
    description: '약관 발효 시각',
  })
  effectiveAt: Date;

  @ApiProperty({
    example: null,
    nullable: true,
    description: '약관 폐기 시각',
  })
  retiredAt: Date | null;

  @ApiProperty({
    example: '2026-06-24T00:00:00.000Z',
    description: '생성 시각',
  })
  createdAt: Date;

  @ApiProperty({
    example: '2026-06-24T00:00:00.000Z',
    description: '수정 시각',
  })
  updatedAt: Date;
}
