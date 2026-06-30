import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateUserNameDto {
  @ApiProperty({
    description: '변경할 사용자 이름',
    example: '홍길동',
  })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  name: string;
}
