import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

const isDefined = (_object: unknown, value: unknown) => value !== undefined;

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateTextRecordDto {
  @ApiPropertyOptional({
    description: '텍스트 기록 제목. 생략하면 기존 값을 유지합니다.',
    example: '7월 2일 미팅 기록',
  })
  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional({
    description: '텍스트 기록 내용. 생략하면 기존 값을 유지합니다.',
    example: '미팅에서 결정된 후속 액션과 다음 일정이 논의되었습니다.',
  })
  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  @MinLength(1)
  content?: string;

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
    description: '텍스트 기록 북마크 여부. 생략하면 기존 값을 유지합니다.',
    example: false,
  })
  @ValidateIf(isDefined)
  @IsBoolean()
  bookMark?: boolean;
}
