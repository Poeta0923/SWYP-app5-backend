import { ApiProperty } from '@nestjs/swagger';
import type { VoiceSttJobCreateResponse } from '../voice-stt-job.service';

export class VoiceRecordSttEntity implements VoiceSttJobCreateResponse {
  @ApiProperty({
    example: 'clx0000000000000000000003',
    description:
      '음성 STT 처리 잡 ID. 이 ID로 GET /record/voice/status/{jobId}를 폴링한다.',
  })
  jobId: string;
}
