import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ImportPersonItemDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  name!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  phoneNumber!: string;
}

export class ImportPeopleDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ImportPersonItemDto)
  people!: ImportPersonItemDto[];
}
