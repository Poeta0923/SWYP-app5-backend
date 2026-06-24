import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsString } from 'class-validator';

export class AgreeAgreementsDto {
  @ApiProperty({
    description: '동의할 현재 유효 약관 문서 ID 목록',
    example: [
      'test-agreement-terms-001',
      'test-agreement-privacy-required-001',
      'test-agreement-marketing-email-001',
    ],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  agreementDocumentIds!: string[];
}
