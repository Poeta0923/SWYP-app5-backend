import { ApiProperty } from '@nestjs/swagger';
import type { PersonCategoryNamesResponse } from '../people.service';

export class PersonCategoryNamesEntity implements PersonCategoryNamesResponse {
  @ApiProperty({
    example: ['경영/기획', '마케팅/홍보', '개발/IT'],
    description: '사용자의 직군 이름 목록',
  })
  jobs: string[];

  @ApiProperty({
    example: ['토스', '카카오'],
    description: '사용자의 회사 이름 목록',
  })
  companies: string[];

  @ApiProperty({
    example: ['대리', '과장', '차장'],
    description: '사용자의 직책 이름 목록',
  })
  positions: string[];

  @ApiProperty({
    example: ['가족', '친구', '동료'],
    description: '사용자의 관계 이름 목록',
  })
  relationships: string[];
}
