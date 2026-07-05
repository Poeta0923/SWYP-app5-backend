import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { PushPlatform } from '../../../generated/prisma/client';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RegisterPushTokenDto {
  @ApiProperty({
    description: 'FCM registration token',
    example: 'fcm-registration-token',
  })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  token: string;

  @ApiPropertyOptional({
    description: '푸시 토큰을 발급한 클라이언트 플랫폼',
    example: PushPlatform.ANDROID,
    enum: PushPlatform,
  })
  @IsOptional()
  @IsEnum(PushPlatform)
  platform?: PushPlatform;
}
