import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { CreateExtraContactDto } from './create-person-item.dto';

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

const optionalBoolean = ({ value }: { value: unknown }) => {
  if (value === '' || value === undefined || value === null) {
    return value;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue === 'true') {
    return true;
  }

  if (normalizedValue === 'false') {
    return false;
  }

  return value;
};

const optionalNullableInteger = ({ value }: { value: unknown }) => {
  if (value === '' || value === null || value === undefined) {
    return value === '' ? null : value;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length === 0 ? null : Number(trimmedValue);
};

export class UpdatePersonItemDto {
  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  @MinLength(1)
  name?: string;

  @Transform(emptyStringToNull)
  @IsOptional()
  @IsDateString()
  birthDate?: string | null;

  @Transform(optionalBoolean)
  @ValidateIf(isDefined)
  @IsBoolean()
  isImportant?: boolean;

  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  @MinLength(1)
  phoneNumber?: string;

  @Transform(emptyStringToNull)
  @IsOptional()
  @IsString()
  job?: string | null;

  @Transform(emptyStringToNull)
  @IsOptional()
  @IsString()
  company?: string | null;

  @Transform(emptyStringToNull)
  @IsOptional()
  @IsString()
  position?: string | null;

  @Transform(emptyStringToNull)
  @IsOptional()
  @IsString()
  relationship?: string | null;

  @Transform(emptyStringToNull)
  @IsOptional()
  @IsString()
  personality?: string | null;

  @Transform(optionalBoolean)
  @ValidateIf(isDefined)
  @IsBoolean()
  birthdayNotificationEnabled?: boolean;

  @Transform(optionalNullableInteger)
  @IsOptional()
  @IsInt()
  @Min(0)
  birthdayNotificationOffsetDays?: number | null;

  @ValidateIf(isDefined)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateExtraContactDto)
  extraContacts?: CreateExtraContactDto[];
}
