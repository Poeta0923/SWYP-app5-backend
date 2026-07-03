import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  VoiceRecordSchedulePersonResponse,
  VoiceRecordScheduleResponse,
} from '../record.service';

export class VoiceRecordSchedulePersonEntity implements VoiceRecordSchedulePersonResponse {
  @ApiProperty({
    example: 'clx0000000000000000000001',
    description: '일정에 연결된 인물 ID',
  })
  id: string;

  @ApiProperty({
    example: '홍길동',
    description: '일정에 연결된 인물 이름',
  })
  name: string;

  @ApiPropertyOptional({
    example:
      'https://cdn.example.com/people/user-1/profiles/profile.png?Expires=...',
    description: '일정에 연결된 인물 프로필 이미지 CloudFront signed URL',
    nullable: true,
  })
  image: string | null;
}

export class VoiceRecordScheduleEntity implements VoiceRecordScheduleResponse {
  @ApiProperty({
    example: 'clx0000000000000000000004',
    description: '일정 ID',
  })
  scheduleId: string;

  @ApiProperty({
    example: '점심 약속',
    description: '일정 제목',
  })
  title: string;

  @ApiProperty({
    example: '2026-07-03T03:00:00.000Z',
    description: '일정 시작 시각',
  })
  scheduleTime: string;

  @ApiProperty({
    example: 'D-1',
    description: '현재 날짜 기준 일정까지 남은 일수',
  })
  dDay: string;

  @ApiProperty({
    type: VoiceRecordSchedulePersonEntity,
    isArray: true,
    description: '일정에 연결된 인물 목록',
  })
  people: VoiceRecordSchedulePersonEntity[];
}
