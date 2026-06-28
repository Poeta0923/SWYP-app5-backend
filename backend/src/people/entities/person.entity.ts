import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  CreatedPersonResponse,
  ImportedPersonListItemResponse,
  PersonListItemResponse,
} from '../people.service';

export class PersonMediaFileEntity {
  @ApiProperty({
    example: 'clx0000000000000000000001',
    description: '미디어 파일 ID',
  })
  id: string;

  @ApiProperty({
    example:
      'https://cdn.example.com/people/user-1/business-cards/front/card.png?Expires=...',
    description: '미디어 파일 CloudFront signed URL',
  })
  url: string;
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

export class ImportedPersonListItemEntity implements ImportedPersonListItemResponse {
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

  @ApiProperty({
    example: '010-1234-5678',
    description: '전화번호',
  })
  phoneNumber: string;

  @ApiPropertyOptional({
    example:
      'https://cdn.example.com/people/user-1/profiles/profile.png?Expires=...',
    description: '프로필 이미지 CloudFront signed URL',
    nullable: true,
  })
  image: string | null;

  @ApiProperty({
    example: false,
    description: '중요 인물 여부',
  })
  isImportant: boolean;
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

  @ApiProperty({
    example: '010-1234-5678',
    description: '전화번호',
  })
  phoneNumber: string;

  @ApiPropertyOptional({
    example:
      'https://cdn.example.com/people/user-1/profiles/profile.png?Expires=...',
    description: '프로필 이미지 CloudFront signed URL',
    nullable: true,
  })
  image: string | null;

  @ApiProperty({
    example: false,
    description: '중요 인물 여부',
  })
  isImportant: boolean;

  @ApiProperty({
    example: '2026-06-28T08:00:00.000Z',
    description: '인물 정보 수정 시각',
  })
  updatedAt: string;
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
    example:
      'https://cdn.example.com/people/user-1/profiles/profile.png?Expires=...',
    description: '프로필 이미지 CloudFront signed URL',
    nullable: true,
  })
  image: string | null;

  @ApiPropertyOptional({
    example: '1990-01-01',
    description: '생년월일',
    nullable: true,
  })
  birthDate: string | null;

  @ApiProperty({
    example: false,
    description: '중요 인물 여부',
  })
  isImportant: boolean;

  @ApiProperty({
    example: '010-1234-5678',
    description: '전화번호',
  })
  phoneNumber: string;

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

  @ApiPropertyOptional({
    example: 1,
    description: '생일 알림 발송 시점(생일 기준 며칠 전)',
    nullable: true,
  })
  birthdayNotificationOffsetDays: number | null;

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
