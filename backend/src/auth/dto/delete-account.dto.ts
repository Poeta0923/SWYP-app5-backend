import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class DeleteAccountDto {
  @ApiProperty({
    // 로그인 때 받은 오래된 ID Token이 아니라, 탈퇴 직전 Google 재인증으로 새로 받은 값이어야 한다.
    description: '탈퇴 직전 Google 재인증으로 발급받은 ID Token',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6...',
  })
  @IsString()
  @MinLength(1)
  idToken!: string;
}
