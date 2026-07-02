import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { RECORD_MEMO_MAX_LENGTH } from '../record.constants';

export class CreateVoiceRecordSttMultipartDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'STT 변환할 m4a 음성 녹음 파일',
  })
  voiceFile!: unknown;

  @ApiPropertyOptional({
    example: '미팅에서 나온 후속 액션을 정리해 주세요.',
    description: `음성 기록에 함께 저장할 메모. 생략 가능하며 최대 ${RECORD_MEMO_MAX_LENGTH}자`,
    maxLength: RECORD_MEMO_MAX_LENGTH,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(RECORD_MEMO_MAX_LENGTH)
  recordMemo?: string | null;
}
