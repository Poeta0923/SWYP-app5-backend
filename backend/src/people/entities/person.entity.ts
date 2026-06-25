import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MediaFileType,
  MediaFileUsage,
} from '../../../generated/prisma/client';
import type {
  CreatedPersonResponse,
  PersonListItemResponse,
} from '../people.service';

export class PersonMediaFileEntity {
  @ApiProperty({
    example: 'clx0000000000000000000001',
    description: '미디어 파일 ID',
  })
  id: string;

  @ApiProperty({
    enum: MediaFileType,
    example: MediaFileType.IMAGE,
    description: '미디어 파일 유형',
  })
  type: MediaFileType;

  @ApiProperty({
    enum: MediaFileUsage,
    example: MediaFileUsage.BUSINESS_CARD_FRONT,
    description: '미디어 파일 사용처',
  })
  usage: MediaFileUsage;

  @ApiProperty({
    example: 'swyp-bucket',
    description: 'S3 버킷 이름',
  })
  bucket: string;

  @ApiProperty({
    example: 'people/user-1/business-cards/front/card.png',
    description: 'S3 object key',
  })
  s3Key: string;

  @ApiProperty({
    example: 'image/png',
    description: 'MIME type',
  })
  contentType: string;

  @ApiProperty({
    example: 12345,
    description: '파일 크기(bytes)',
  })
  sizeBytes: number;

  @ApiPropertyOptional({
    example: 'card.png',
    description: '원본 파일명',
    nullable: true,
  })
  originalName: string | null;
}

export class PersonBusinessCardEntity {
  @ApiProperty({
    example: 'clx0000000000000000000002',
    description: '명함 ID',
  })
  id: string;

  @ApiPropertyOptional({
    type: PersonMediaFileEntity,
    nullable: true,
    description: '명함 앞면 이미지 파일',
  })
  frontImageFile: PersonMediaFileEntity | null;

  @ApiPropertyOptional({
    type: PersonMediaFileEntity,
    nullable: true,
    description: '명함 뒷면 이미지 파일',
  })
  backImageFile: PersonMediaFileEntity | null;
}

export class PersonExtraContactEntity {
  @ApiProperty({
    example: 'clx0000000000000000000004',
    description: '추가 연락처 ID',
  })
  id: string;

  @ApiProperty({
    example: 'email',
    description: '추가 정보 유형',
  })
  type: string;

  @ApiProperty({
    example: 'user@example.com',
    description: '추가 정보 내용',
  })
  content: string;
}

export class PersonListItemEntity implements PersonListItemResponse {
  @ApiProperty({
    example: 'clx0000000000000000000003',
    description: '인물 ID',
  })
  id: string;

  @ApiProperty({
    example: '홍길동',
    description: '이름',
  })
  name: string;

  @ApiPropertyOptional({
    example: '010-1234-5678',
    description: '전화번호',
    nullable: true,
  })
  phoneNumber: string | null;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/people/user-1/profiles/profile.png',
    description: '프로필 이미지 URL',
    nullable: true,
  })
  image: string | null;

  @ApiProperty({
    example: false,
    description: '중요 인물 여부',
  })
  isImportant: boolean;
}

export class PersonEntity implements CreatedPersonResponse {
  @ApiProperty({
    example: 'clx0000000000000000000003',
    description: '인물 ID',
  })
  id: string;

  @ApiProperty({
    example: '홍길동',
    description: '이름',
  })
  name: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/people/user-1/profiles/profile.png',
    description: '프로필 이미지 URL',
    nullable: true,
  })
  image: string | null;

  @ApiPropertyOptional({
    example: '1990-01-01',
    description: '생년월일',
    nullable: true,
  })
  birthDate: Date | null;

  @ApiProperty({
    example: false,
    description: '중요 인물 여부',
  })
  isImportant: boolean;

  @ApiPropertyOptional({
    example: '010-1234-5678',
    description: '전화번호',
    nullable: true,
  })
  phoneNumber: string | null;

  @ApiPropertyOptional({
    example: '개발/IT',
    description: '직군',
    nullable: true,
  })
  job: string | null;

  @ApiPropertyOptional({
    example: '토스',
    description: '회사',
    nullable: true,
  })
  company: string | null;

  @ApiPropertyOptional({
    example: '과장',
    description: '직책',
    nullable: true,
  })
  position: string | null;

  @ApiPropertyOptional({
    example: '동료',
    description: '관계',
    nullable: true,
  })
  relationship: string | null;

  @ApiPropertyOptional({
    example: '차분하고 꼼꼼함',
    description: '성격 메모',
    nullable: true,
  })
  personality: string | null;

  @ApiProperty({
    example: false,
    description: '생일 알림 활성화 여부',
  })
  birthdayNotificationEnabled: boolean;

  @ApiProperty({
    example: false,
    description: '일정 알림 활성화 여부',
  })
  scheduleNotificationEnabled: boolean;

  @ApiProperty({
    type: PersonExtraContactEntity,
    isArray: true,
    description: '추가 연락처 및 기타 정보 목록',
  })
  extraContacts: PersonExtraContactEntity[];

  @ApiProperty({
    type: PersonBusinessCardEntity,
    isArray: true,
    description: '명함 목록',
  })
  businessCards: PersonBusinessCardEntity[];
}
