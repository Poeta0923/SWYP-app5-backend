import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: '서버에서 발급한 Refresh Token',
    example: 'refresh-token-value',
  })
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}
