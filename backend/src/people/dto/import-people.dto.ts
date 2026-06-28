import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ImportPersonItemDto {
  @ApiProperty({
    example: '홍길동',
    description: '연락처 이름',
  })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({
    example: '010-1234-5678',
    description: '연락처 전화번호',
  })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  phoneNumber!: string;
}

export class ImportPeopleDto {
  @ApiProperty({
    type: ImportPersonItemDto,
    isArray: true,
    description: '기기 연락처에서 가져온 인물 목록',
    example: [
      {
        name: '홍길동',
        phoneNumber: '010-1234-5678',
      },
      {
        name: '김영희',
        phoneNumber: '010-1234-5678',
      },
    ],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ImportPersonItemDto)
  people!: ImportPersonItemDto[];
}
