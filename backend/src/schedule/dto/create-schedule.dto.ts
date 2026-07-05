import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const emptyStringToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length === 0 ? null : trimmedValue;
};

export class CreateScheduleDto {
  @ApiProperty({
    description: '일정 제목',
    example: '점심 약속',
  })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  title: string;

  @ApiProperty({
    description: '일정 시작 시각',
    example: '2026-07-03T03:00:00.000Z',
  })
  @IsDateString()
  scheduleTime: string;

  @ApiProperty({
    description: '연결할 인물 ID 목록',
    example: ['clx0000000000000000000001', 'clx0000000000000000000002'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @ArrayUnique()
  personIds: string[];

  @ApiProperty({
    description: '일정 알림 활성화 여부',
    example: true,
  })
  @IsBoolean()
  notificationEnabled: boolean;

  @ApiProperty({
    description: '일정 시작일 기준 며칠 전에 알림을 받을지 설정한 일수',
    example: 1,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  reminderOffsetDays: number;

  @ApiPropertyOptional({
    description: '일정 내용',
    example: '강남역 근처에서 점심 식사',
    nullable: true,
  })
  @Transform(emptyStringToNull)
  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string | null;

  @ApiPropertyOptional({
    description: '연결할 기록 ID',
    example: 'clx0000000000000000000003',
    nullable: true,
  })
  @Transform(emptyStringToNull)
  @IsOptional()
  @IsString()
  @MinLength(1)
  recordId?: string | null;
}
