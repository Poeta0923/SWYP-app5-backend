import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PushPlatform } from '../../../generated/prisma/client';
import type { PushTokenResponse } from '../push-token.service';

export class PushTokenEntity implements PushTokenResponse {
  @ApiProperty({
    example: 'clx0000000000000000000001',
    description: '푸시 토큰 ID',
  })
  id: string;

  @ApiPropertyOptional({
    example: 'ANDROID',
    description: '푸시 토큰을 발급한 클라이언트 플랫폼',
    enum: ['IOS', 'ANDROID', 'WEB'],
    nullable: true,
  })
  platform: PushPlatform | null;

  @ApiProperty({
    example: '2026-07-05T12:00:00.000Z',
    description: '푸시 토큰 마지막 등록/갱신 시각',
  })
  lastSeenAt: string;
}
