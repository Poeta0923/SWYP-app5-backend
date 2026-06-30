import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

const optionalInteger = ({ value }: { value: unknown }) => {
  if (value === '' || value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length === 0 ? undefined : Number(trimmedValue);
};

export class CreateExtraContactDto {
  @ApiProperty({
    description: '추가 연락처 종류',
    example: 'email',
  })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  type!: string;

  @ApiProperty({
    description: '추가 연락처 값',
    example: 'user@example.com',
  })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  content!: string;
}

export class CreatePersonItemDto {
  @ApiProperty({
    description: '이름',
    example: '홍길동',
  })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({
    description: '생년월일',
    example: '1990-01-01',
  })
  @Transform(emptyStringToUndefined)
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({
    description: '중요 인물 여부',
    example: true,
  })
  @Transform(optionalBoolean)
  @IsOptional()
  @IsBoolean()
  isImportant?: boolean;

  @ApiProperty({
    description: '전화번호',
    example: '010-1234-5678',
  })
  @Transform(emptyStringToUndefined)
  @IsString()
  @MinLength(1)
  phoneNumber!: string;

  @ApiPropertyOptional({
    description: '직군',
    example: '개발/IT',
  })
  @Transform(emptyStringToUndefined)
  @IsOptional()
  @IsString()
  job?: string;

  @ApiPropertyOptional({
    description: '회사',
    example: '토스',
  })
  @Transform(emptyStringToUndefined)
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional({
    description: '직책',
    example: '과장',
  })
  @Transform(emptyStringToUndefined)
  @IsOptional()
  @IsString()
  position?: string;

  @ApiPropertyOptional({
    description: '관계',
    example: '동료',
  })
  @Transform(emptyStringToUndefined)
  @IsOptional()
  @IsString()
  relationship?: string;

  @ApiPropertyOptional({
    description: '성격/메모',
    example: '차분하고 꼼꼼함',
  })
  @Transform(emptyStringToUndefined)
  @IsOptional()
  @IsString()
  personality?: string;

  @ApiPropertyOptional({
    description: '생일 알림 여부',
    example: true,
  })
  @Transform(optionalBoolean)
  @IsOptional()
  @IsBoolean()
  birthdayNotificationEnabled?: boolean;

  @ApiPropertyOptional({
    description: '생일 며칠 전 알림을 보낼지. 생략하면 1일 전으로 저장합니다.',
    example: 1,
    minimum: 0,
  })
  @Transform(optionalInteger)
  @IsOptional()
  @IsInt()
  @Min(0)
  birthdayNotificationOffsetDays?: number;

  @ApiPropertyOptional({
    description: '추가 연락처 목록',
    type: [CreateExtraContactDto],
    example: [
      {
        type: 'email',
        content: 'user@example.com',
      },
      {
        type: 'instagram',
        content: '@hong',
      },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateExtraContactDto)
  extraContacts?: CreateExtraContactDto[];
}
