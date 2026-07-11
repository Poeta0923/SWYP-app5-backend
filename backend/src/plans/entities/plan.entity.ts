import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PlanDetailEntity {
  @ApiProperty({ example: '4900', description: '월 청구액(원). "0"은 무료.' })
  charge: string;

  @ApiProperty({
    example: '인물 등록 최대 50명',
    description: '인물 등록 한도 표시 문구',
  })
  maxPeople: string;

  @ApiProperty({
    example: '클라우드 5GB',
    description: '클라우드 용량 표시 문구',
  })
  volume: string;

  @ApiProperty({ example: 'AI 음성 요약 무제한', description: '요금제 혜택 1' })
  feature1: string;

  @ApiPropertyOptional({
    example: 'AI 요약 모드 커스텀',
    description: '요금제 혜택 2 (있는 요금제만)',
  })
  feature2?: string;

  @ApiPropertyOptional({
    example: '공유 링크 생성 (URL)',
    description: '요금제 혜택 3 (있는 요금제만)',
  })
  feature3?: string;
}

export class PlansResponseEntity {
  @ApiProperty({ type: PlanDetailEntity })
  Basic: PlanDetailEntity;

  @ApiProperty({ type: PlanDetailEntity })
  Pro: PlanDetailEntity;

  @ApiProperty({ type: PlanDetailEntity })
  Premium: PlanDetailEntity;
}
