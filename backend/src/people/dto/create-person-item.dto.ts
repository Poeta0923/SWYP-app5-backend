import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// multipart/form-data에서 optional text field가 빈 문자열로 들어오는 경우
// nullable 컬럼에는 undefined로 넘겨 Prisma 기본 처리와 맞춘다.
const emptyStringToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length === 0 ? undefined : trimmedValue;
};

// people JSON 안의 boolean 값은 실제 boolean 또는 문자열 "true"/"false" 모두 허용한다.
const optionalBoolean = ({ value }: { value: unknown }) => {
  if (value === '' || value === undefined || value === null) {
    return undefined;
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

export class CreateExtraContactDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  type!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  content!: string;
}

export class CreatePersonItemDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  name!: string;

  @Transform(emptyStringToUndefined)
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @Transform(optionalBoolean)
  @IsOptional()
  @IsBoolean()
  isImportant?: boolean;

  @Transform(emptyStringToUndefined)
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @Transform(emptyStringToUndefined)
  @IsOptional()
  @IsString()
  job?: string;

  @Transform(emptyStringToUndefined)
  @IsOptional()
  @IsString()
  company?: string;

  @Transform(emptyStringToUndefined)
  @IsOptional()
  @IsString()
  position?: string;

  @Transform(emptyStringToUndefined)
  @IsOptional()
  @IsString()
  relationship?: string;

  @Transform(emptyStringToUndefined)
  @IsOptional()
  @IsString()
  personality?: string;

  @Transform(optionalBoolean)
  @IsOptional()
  @IsBoolean()
  birthdayNotificationEnabled?: boolean;

  @Transform(optionalBoolean)
  @IsOptional()
  @IsBoolean()
  scheduleNotificationEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateExtraContactDto)
  extraContacts?: CreateExtraContactDto[];
}
