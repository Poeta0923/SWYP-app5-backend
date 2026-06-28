import { ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiPropertyOptional({
    description: '이름. 생략하면 기존 값을 유지합니다.',
    example: '홍길동',
  })
  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({
    description: '생년월일. null 또는 빈 문자열을 보내면 값을 비웁니다.',
    example: '1990-01-01',
    nullable: true,
  })
  @Transform(emptyStringToNull)
  @IsOptional()
  @IsDateString()
  birthDate?: string | null;

  @ApiPropertyOptional({
    description: '중요 인물 여부. 생략하면 기존 값을 유지합니다.',
    example: true,
  })
  @Transform(optionalBoolean)
  @ValidateIf(isDefined)
  @IsBoolean()
  isImportant?: boolean;

  @ApiPropertyOptional({
    description: '전화번호. 변경 시 현재 인물을 제외하고 중복 검사합니다.',
    example: '010-1234-5678',
  })
  @Transform(trimString)
  @ValidateIf(isDefined)
  @IsString()
  @MinLength(1)
  phoneNumber?: string;

  @ApiPropertyOptional({
    description: '직군. null 또는 빈 문자열을 보내면 값을 비웁니다.',
    example: '개발/IT',
    nullable: true,
  })
  @Transform(emptyStringToNull)
  @IsOptional()
  @IsString()
  job?: string | null;

  @ApiPropertyOptional({
    description: '회사. null 또는 빈 문자열을 보내면 값을 비웁니다.',
    example: '토스',
    nullable: true,
  })
  @Transform(emptyStringToNull)
  @IsOptional()
  @IsString()
  company?: string | null;

  @ApiPropertyOptional({
    description: '직책. null 또는 빈 문자열을 보내면 값을 비웁니다.',
    example: '과장',
    nullable: true,
  })
  @Transform(emptyStringToNull)
  @IsOptional()
  @IsString()
  position?: string | null;

  @ApiPropertyOptional({
    description: '관계. null 또는 빈 문자열을 보내면 값을 비웁니다.',
    example: '동료',
    nullable: true,
  })
  @Transform(emptyStringToNull)
  @IsOptional()
  @IsString()
  relationship?: string | null;

  @ApiPropertyOptional({
    description: '성격/메모. null 또는 빈 문자열을 보내면 값을 비웁니다.',
    example: '차분하고 꼼꼼함',
    nullable: true,
  })
  @Transform(emptyStringToNull)
  @IsOptional()
  @IsString()
  personality?: string | null;

  @ApiPropertyOptional({
    description:
      '생일 알림 여부. false로 보내면 birthdayNotificationOffsetDays도 null로 저장합니다.',
    example: true,
  })
  @Transform(optionalBoolean)
  @ValidateIf(isDefined)
  @IsBoolean()
  birthdayNotificationEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      '생일 며칠 전 알림을 보낼지. 생일 알림이 켜진 최종 상태에서는 필수입니다.',
    example: 1,
    minimum: 0,
    nullable: true,
  })
  @Transform(optionalNullableInteger)
  @IsOptional()
  @IsInt()
  @Min(0)
  birthdayNotificationOffsetDays?: number | null;

  @ApiPropertyOptional({
    description:
      '추가 연락처 목록. 생략하면 유지, 빈 배열이면 전체 삭제, 배열이면 전체 교체합니다.',
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
  @ValidateIf(isDefined)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateExtraContactDto)
  extraContacts?: CreateExtraContactDto[];
}
