import { ApiProperty } from '@nestjs/swagger';
import type { VoiceRecordSummaryResponse } from '../record.service';

export class VoiceRecordSummaryEntity implements VoiceRecordSummaryResponse {
  @ApiProperty({
    example: 'clx0000000000000000000003',
    description: '요약된 기록 ID',
  })
  id: string;
}
