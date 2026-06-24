import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsString } from 'class-validator';

export class AgreeAgreementsDto {
  @ApiProperty({
    description: '동의할 현재 유효 약관 문서 ID 목록',
    example: [
      'clx0000000000000000000001',
      'clx0000000000000000000002',
      'clx0000000000000000000003',
    ],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  agreementDocumentIds!: string[];
}
