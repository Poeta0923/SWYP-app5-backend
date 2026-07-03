import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsString, MinLength } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTextRecordDto {
  @ApiProperty({
    description: '텍스트 기록 제목',
    example: '7월 2일 미팅 기록',
  })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  title: string;

  @ApiProperty({
    description: '텍스트 기록 내용',
    example: '미팅에서 결정된 후속 액션과 다음 일정이 논의되었습니다.',
  })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  content: string;

  @ApiProperty({
    description: '연결할 인물 ID 목록',
    example: ['clx0000000000000000000001', 'clx0000000000000000000002'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @ArrayUnique()
  peopleIds: string[];
}
