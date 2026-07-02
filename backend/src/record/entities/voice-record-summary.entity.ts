import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { VoiceRecordSummaryResponse } from '../record.service';

export class VoiceRecordSummaryEntity implements VoiceRecordSummaryResponse {
  @ApiProperty({
    example: 'clx0000000000000000000003',
    description: '요약된 기록 ID',
  })
  recordId: string;

  @ApiProperty({
    example: '제목 없음',
    description: '기록 제목',
  })
  title: string;

  @ApiProperty({
    example: '2026-07-02T01:00:00.000Z',
    description: '기록 생성 시각',
  })
  createdAt: string;

  @ApiProperty({
    example: ['미팅', '후속 액션'],
    description: '기록 키워드 목록',
    isArray: true,
  })
  keyword: string[];

  @ApiProperty({
    example: '미팅에서 결정된 후속 액션과 다음 일정이 논의되었습니다.',
    description: '요약 후 저장된 기록 내용',
  })
  content: string;

  @ApiProperty({
    example:
      'https://cdn.example.com/records/user-1/voice/recording.m4a?Expires=...',
    description: '음성 녹음 파일 CloudFront signed URL',
    nullable: true,
  })
  voiceFileUrl: string | null;

  @ApiPropertyOptional({
    example: '미팅에서 나온 후속 액션을 정리해 주세요.',
    description: '기록 메모',
    nullable: true,
  })
  recordMemo: string | null;
}
