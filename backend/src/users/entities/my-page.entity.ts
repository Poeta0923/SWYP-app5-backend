import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { MyPageResponse, MyPageUserResponse } from '../users.service';

export class MyPageUserEntity implements MyPageUserResponse {
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
}

export class MyPageEntity implements MyPageResponse {
  @ApiProperty({
    type: MyPageUserEntity,
    description: '사용자 정보',
  })
  user: MyPageUserEntity;

  @ApiProperty({
    example: 12.5,
    description: 'VOICE 기록에 연결된 미디어 파일 총 용량(MB)',
  })
  voiceRecordMediaSizeMb: number;
}
