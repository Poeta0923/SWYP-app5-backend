import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

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

export class UpdateScheduleDto {
  @ApiPropertyOptional({
    description: '일정 제목. 생략하면 기존 값을 유지합니다.',
    example: '점심 약속',
  })
  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional({
    description: '일정 시작 시각. 생략하면 기존 값을 유지합니다.',
    example: '2026-07-03T03:00:00.000Z',
  })
  @ValidateIf(isDefined)
  @IsDateString()
  scheduleTime?: string;

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
    description: '일정 내용. 생략하면 유지, null 또는 빈 문자열이면 삭제합니다.',
    example: '강남역 근처에서 점심 식사',
    nullable: true,
  })
  @Transform(emptyStringToNull)
  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string | null;

  @ApiPropertyOptional({
    description: '일정 알림 활성화 여부. 생략하면 기존 값을 유지합니다.',
    example: true,
  })
  @ValidateIf(isDefined)
  @IsBoolean()
  notificationEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      '일정 시작일 기준 며칠 전에 알림을 받을지 설정한 일수. 생략하면 기존 값을 유지합니다.',
    example: 1,
    minimum: 0,
  })
  @ValidateIf(isDefined)
  @IsInt()
  @Min(0)
  reminderOffsetDays?: number;
}
