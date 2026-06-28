import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePersonMultipartDto {
  @ApiProperty({
    type: 'string',
    description: 'Person 생성 정보 JSON 객체 문자열',
    example: JSON.stringify({
      name: '홍길동',
      birthDate: '1990-01-01',
      isImportant: true,
      phoneNumber: '010-1234-5678',
      job: '개발/IT',
      company: '토스',
      position: '과장',
      relationship: '동료',
      personality: '차분하고 꼼꼼함',
      birthdayNotificationEnabled: true,
      scheduleNotificationEnabled: false,
      extraContacts: [
        {
          type: 'email',
          content: 'user@example.com',
        },
        {
          type: 'instagram',
          content: '@hong',
        },
      ],
    }),
  })
  person!: string;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: '프로필 이미지',
  })
  image?: unknown;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: '명함 앞면 이미지',
  })
  businessCardFrontImage?: unknown;

  @ApiPropertyOptional({
    type: 'string',
    format: 'binary',
    description: '명함 뒷면 이미지',
  })
  businessCardBackImage?: unknown;
}
