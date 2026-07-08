import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  TextRecordCreateResponse,
  TextRecordDetailResponse,
  TextRecordPersonResponse,
} from '../record.service';
import { VoiceRecordScheduleEntity } from './voice-record-schedule.entity';

export class TextRecordPersonEntity implements TextRecordPersonResponse {
  @ApiProperty({
    example: 'clx0000000000000000000001',
    description: '인물 ID',
  })
  id: string;

  @ApiProperty({
    example: '홍길동',
    description: '인물 이름',
  })
  name: string;

  @ApiPropertyOptional({
    example:
      'https://cdn.example.com/people/user-1/profiles/profile.png?Expires=...',
    description: '프로필 이미지 CloudFront signed URL',
    nullable: true,
  })
  image: string | null;
}

export class TextRecordEntity implements TextRecordCreateResponse {
  @ApiProperty({
    example: 'clx0000000000000000000003',
    description: '텍스트 기록 ID',
  })
  recordId: string;

  @ApiProperty({
    example: '7월 2일 미팅 기록',
    description: '텍스트 기록 제목',
  })
  title: string;

  @ApiProperty({
    example: '2026-07-02T01:00:00.000Z',
    description: '기록 생성 시각',
  })
  createdAt: string;

  @ApiProperty({
    example: '미팅에서 결정된 후속 액션과 다음 일정이 논의되었습니다.',
    description: '텍스트 기록 내용',
  })
  content: string;

  @ApiProperty({
    example: false,
    description: '텍스트 기록 북마크 여부',
  })
  bookMark: boolean;

  @ApiProperty({
    type: TextRecordPersonEntity,
    isArray: true,
    description: '기록에 연결된 인물 목록',
  })
  people: TextRecordPersonEntity[];
}

export class TextRecordDetailEntity
  extends TextRecordEntity
  implements TextRecordDetailResponse
{
  @ApiPropertyOptional({
    type: VoiceRecordScheduleEntity,
    description: '기록에 연결된 일정 정보',
    nullable: true,
  })
  schedule: VoiceRecordScheduleEntity | null;
}
