import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  VoiceRecordPersonResponse,
  VoiceRecordUpdateResponse,
} from '../record.service';

export class VoiceRecordPersonEntity implements VoiceRecordPersonResponse {
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
}

export class VoiceRecordUpdateEntity implements VoiceRecordUpdateResponse {
  @ApiProperty({
    example: 'clx0000000000000000000003',
    description: '수정된 음성 기록 ID',
  })
  recordId: string;

  @ApiProperty({
    example: '7월 2일 미팅 기록',
    description: '음성 기록 제목',
  })
  title: string;

  @ApiPropertyOptional({
    example: '후속 액션 중심으로 다시 확인 필요',
    description: '기록 메모',
    nullable: true,
  })
  recordMemo: string | null;

  @ApiProperty({
    type: VoiceRecordPersonEntity,
    isArray: true,
    description: '연결된 인물 목록',
  })
  people: VoiceRecordPersonEntity[];

  @ApiProperty({
    example: '2026-07-02T01:00:00.000Z',
    description: '기록 수정 시각',
  })
  updatedAt: string;
}
