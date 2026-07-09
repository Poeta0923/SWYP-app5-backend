import { ApiProperty } from '@nestjs/swagger';
import type { VoiceRecordSttResponse } from '../record.service';

export class VoiceRecordSttEntity implements VoiceRecordSttResponse {
  @ApiProperty({
    example: 'clx0000000000000000000003',
    description: '기록 ID',
  })
  id: string;
}
