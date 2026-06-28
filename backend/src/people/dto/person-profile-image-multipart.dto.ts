import { ApiProperty } from '@nestjs/swagger';

export class PersonProfileImageMultipartDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: '프로필 이미지',
  })
  image!: unknown;
}
