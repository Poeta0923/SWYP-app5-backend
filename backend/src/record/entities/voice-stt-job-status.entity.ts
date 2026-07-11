import { ApiProperty } from '@nestjs/swagger';
import { VoiceSttJobStatus } from '../../../generated/prisma/client';
import type { VoiceSttJobStatusResponse } from '../voice-stt-job.service';

export class VoiceSttJobStatusEntity implements VoiceSttJobStatusResponse {
  @ApiProperty({
    enum: VoiceSttJobStatus,
    example: VoiceSttJobStatus.STT_PROCESSING,
    description:
      'STT_PROCESSING(전사 중) / SUMMARY_PROCESSING(요약 중) / COMPLETED(완료) / FAILED(실패)',
  })
  status: VoiceSttJobStatus;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description: 'COMPLETED일 때 생성된 음성 기록 ID (그 외에는 null)',
  })
  recordId: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description: 'FAILED일 때 실패 원인 코드 (그 외에는 null)',
  })
  errorCode: string | null;
}
