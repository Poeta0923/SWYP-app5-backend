import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString } from 'class-validator';

export class UpdateAgreementConsentDto {
  @ApiProperty({
    description: '동의 상태를 변경할 현재 유효 약관 문서 ID',
    example: 'clx0000000000000000000003',
  })
  @IsString()
  agreementDocumentId!: string;

  @ApiProperty({
    description: '약관 동의 여부',
    example: false,
  })
  @IsBoolean()
  agreed!: boolean;
}
