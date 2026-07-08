import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  ScheduleDetailResponse,
  ScheduleListItemResponse,
  SchedulePersonResponse,
} from '../schedule.service';

export class SchedulePersonEntity implements SchedulePersonResponse {
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

export class ScheduleListItemEntity implements ScheduleListItemResponse {
  @ApiProperty({
    example: 'clx0000000000000000000002',
    description: '일정 ID',
  })
  id: string;

  @ApiProperty({
    example: '점심 약속',
    description: '일정 제목',
  })
  title: string;

  @ApiProperty({
    type: SchedulePersonEntity,
    isArray: true,
    description: '일정에 연결된 인물 목록',
  })
  people: SchedulePersonEntity[];

  @ApiProperty({
    example: '2026-07-03T03:00:00.000Z',
    description: '일정 시작 시각',
  })
  scheduleTime: string;

  @ApiProperty({
    example: false,
    description: '일정 북마크 여부',
  })
  bookMark: boolean;

  @ApiProperty({
    example: 'D-1',
    description: '현재 날짜 기준 일정까지 남은 일수',
  })
  dDay: string;

  @ApiProperty({
    example: 30,
    description: '일정 시작 시각 기준 몇 분 전에 알림을 받을지 설정한 분 단위 값',
  })
  reminderOffsetMinutes: number;
}

export class ScheduleDetailEntity implements ScheduleDetailResponse {
  @ApiProperty({
    example: 'clx0000000000000000000002',
    description: '일정 ID',
  })
  id: string;

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
    type: SchedulePersonEntity,
    isArray: true,
    description: '일정에 연결된 인물 목록',
  })
  people: SchedulePersonEntity[];

  @ApiPropertyOptional({
    example: '강남역 근처에서 점심 식사',
    description: '일정 내용',
    nullable: true,
  })
  content: string | null;

  @ApiProperty({
    example: false,
    description: '일정 북마크 여부',
  })
  bookMark: boolean;

  @ApiProperty({
    example: true,
    description: '일정 알림 활성화 여부',
  })
  notificationEnabled: boolean;

  @ApiProperty({
    example: 30,
    description: '일정 시작 시각 기준 몇 분 전에 알림을 받을지 설정한 분 단위 값',
  })
  reminderOffsetMinutes: number;
}
