import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { RECORD_MEMO_MAX_LENGTH } from '../record.constants';

const isDefined = (_object: unknown, value: unknown) => value !== undefined;

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const emptyStringToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length === 0 ? null : trimmedValue;
};

export class UpdateVoiceRecordDto {
  @ApiPropertyOptional({
    description: '음성 기록 제목. 생략하면 기존 값을 유지합니다.',
    example: '7월 2일 미팅 기록',
  })
  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional({
    description:
      '기록 메모. 생략하면 유지, null 또는 빈 문자열이면 삭제, 문자열이면 생성 또는 변경합니다.',
    example: '후속 액션 중심으로 다시 확인 필요',
    nullable: true,
    maxLength: RECORD_MEMO_MAX_LENGTH,
  })
  @Transform(emptyStringToNull)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(RECORD_MEMO_MAX_LENGTH)
  recordMemo?: string | null;

  @ApiPropertyOptional({
    description:
      '연결할 인물 ID 목록. 생략하면 유지, 빈 배열이면 모두 삭제, 배열이면 전체 교체합니다.',
    example: ['clx0000000000000000000001', 'clx0000000000000000000002'],
    type: [String],
  })
  @ValidateIf(isDefined)
  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @ArrayUnique()
  personIds?: string[];

  @ApiPropertyOptional({
    description: '음성 기록 북마크 여부. 생략하면 기존 값을 유지합니다.',
    example: false,
  })
  @ValidateIf(isDefined)
  @IsBoolean()
  bookMark?: boolean;
}
