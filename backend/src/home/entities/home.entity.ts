import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  HomeImportantPersonResponse,
  HomeRecordResponse,
  HomeResponse,
  HomeScheduleResponse,
} from '../home.service';

export class HomeScheduleEntity implements HomeScheduleResponse {
  @ApiProperty({
    example: 'clx0000000000000000000001',
    description: '일정 ID',
  })
  id: string;

  @ApiProperty({
    example: '점심 약속',
    description: '일정 제목',
  })
  title: string;

  @ApiProperty({
    example: '2026-06-29T03:00:00.000Z',
    description: '일정 시작 시각',
  })
  scheduleTime: string;

  @ApiProperty({
    example: 'D-0',
    description: '현재 날짜 기준 일정까지 남은 일수',
  })
  dDay: string;
}

export class HomeImportantPersonEntity implements HomeImportantPersonResponse {
  @ApiProperty({
    example: 'clx0000000000000000000002',
    description: '인물 ID',
  })
  id: string;

  @ApiProperty({
    example: '홍길동',
    description: '이름',
  })
  name: string;

  @ApiProperty({
    example: true,
    description: '중요 인물 여부',
  })
  isImportant: boolean;

  @ApiPropertyOptional({
    example: '개발/IT',
    description: '직군',
    nullable: true,
  })
  job: string | null;

  @ApiPropertyOptional({
    example: '토스',
    description: '회사',
    nullable: true,
  })
  company: string | null;

  @ApiPropertyOptional({
    example: '과장',
    description: '직책',
    nullable: true,
  })
  position: string | null;

  @ApiPropertyOptional({
    example: '동료',
    description: '관계',
    nullable: true,
  })
  relationship: string | null;

  @ApiPropertyOptional({
    example:
      'https://cdn.example.com/people/user-1/profiles/profile.png?Expires=...',
    description: '프로필 이미지 CloudFront signed URL',
    nullable: true,
  })
  image: string | null;
}

export class HomeRecordEntity implements HomeRecordResponse {
  @ApiProperty({
    example: 'clx0000000000000000000003',
    description: '기록 ID',
  })
  id: string;

  @ApiProperty({
    example: 'VOICE',
    description: '기록 유형',
    enum: ['TEXT', 'VOICE'],
  })
  type: string;

  @ApiProperty({
    example: '미팅 기록',
    description: '기록 제목',
  })
  title: string;

  @ApiProperty({
    example: ['홍길동', '김영희'],
    description: '기록에 연결된 인물 이름 목록',
    isArray: true,
  })
  people: string[];

  @ApiProperty({
    example: '2026-06-29T01:00:00.000Z',
    description: '기록 생성 시각',
  })
  createdAt: string;

  @ApiPropertyOptional({
    example: '03:25',
    description: 'VOICE 기록의 녹음 길이(분:초)',
    nullable: true,
  })
  voiceDuration: string | null;
}

export class HomeResponseEntity implements HomeResponse {
  @ApiProperty({
    type: HomeScheduleEntity,
    isArray: true,
    description: '전체 다가오는 일정 중 가까운 일정 최대 5개',
  })
  schedules: HomeScheduleEntity[];

  @ApiProperty({
    type: HomeImportantPersonEntity,
    isArray: true,
    description: '최근 상호작용한 중요 인물 최대 3명',
  })
  people: HomeImportantPersonEntity[];

  @ApiProperty({
    type: HomeRecordEntity,
    isArray: true,
    description: '최근 생성된 기록 최대 5개',
  })
  records: HomeRecordEntity[];
}
