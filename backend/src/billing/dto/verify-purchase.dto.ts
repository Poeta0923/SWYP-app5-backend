import { Transform } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** 모바일 앱이 인앱 구매 완료 후 서버 검증을 요청할 때 보내는 페이로드. */
export class VerifyPurchaseDto {
  @ApiProperty({
    example: 'pro_monthly',
    description:
      'Play Console 구독 상품 ID (google_play_products에 등록돼 있어야 함)',
  })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  productId!: string;

  @ApiProperty({
    description: '구매 시 Google Play가 발급한 purchaseToken',
  })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  purchaseToken!: string;
}
