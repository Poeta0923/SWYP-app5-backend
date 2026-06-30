import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { UserResponse } from '../users.service';

export class UserEntity implements UserResponse {
  @ApiProperty({
    example: 'clx0000000000000000000000',
    description: '사용자 ID',
  })
  id: string;

  @ApiProperty({
    example: '홍길동',
    description: '사용자 이름',
  })
  name: string;

  @ApiPropertyOptional({
    example: 'user@example.com',
    description: '사용자 이메일',
    nullable: true,
  })
  email: string | null;

  @ApiPropertyOptional({
    example: 'https://lh3.googleusercontent.com/a/example',
    description: '사용자 프로필 이미지 URL',
    nullable: true,
  })
  image: string | null;

  @ApiProperty({
    example: 'USER',
    description: '사용자 권한',
  })
  role: string;

  @ApiProperty({
    example: false,
    description: '프리미엄 사용자 여부',
  })
  isPremium: boolean;
}
