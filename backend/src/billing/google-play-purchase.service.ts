import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GoogleSubscriptionStatus,
  Prisma,
  UserPlan,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GooglePlayApiClient } from './google-play-api.client';
import { mapSubscription } from './google-subscription.mapper';
import { PlanResolutionService } from './plan-resolution.service';
import { VerifyPurchaseDto } from './dto/verify-purchase.dto';

/** 구매 검증 결과 요약. 클라이언트가 현재 권한 상태를 갱신하는 데 쓴다. */
export interface VerifyPurchaseResult {
  plan: UserPlan;
  status: GoogleSubscriptionStatus;
  expiresAt: Date | null;
}

@Injectable()
export class GooglePlayPurchaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiClient: GooglePlayApiClient,
    private readonly planResolution: PlanResolutionService,
  ) {}

  /**
   * 앱이 보낸 purchaseToken을 Google에 검증하고 구독을 반영한 뒤 User.plan을 동기화한다.
   *
   * @param userId 구매를 요청한 유저
   * @param dto productId + purchaseToken
   * @returns 확정된 plan/status/만료시각
   * @throws NotFoundException 등록되지 않았거나 비활성 상품일 때
   * @throws ForbiddenException 다른 유저가 이미 등록한 purchaseToken일 때
   */
  async verifyPurchase(
    userId: string,
    dto: VerifyPurchaseDto,
  ): Promise<VerifyPurchaseResult> {
    // 등록된(활성) 상품만 받는다. 스키마 FK(Restrict)와 동일한 정책을 명시적 에러로.
    const product = await this.prisma.googlePlayProduct.findUnique({
      where: { productId: dto.productId },
    });
    if (!product || !product.active) {
      throw new NotFoundException({
        code: 'GOOGLE_PLAY_PRODUCT_NOT_FOUND',
        message: '등록되지 않은 상품입니다.',
      });
    }

    // purchaseToken 하이재킹 방지: 이미 다른 유저 소유면 거부.
    const existing = await this.prisma.googlePlaySubscription.findUnique({
      where: { purchaseToken: dto.purchaseToken },
      select: { userId: true },
    });
    if (existing && existing.userId !== userId) {
      throw new ForbiddenException({
        code: 'GOOGLE_PLAY_TOKEN_OWNED_BY_OTHER',
        message: '다른 계정에서 사용 중인 구매입니다.',
      });
    }

    const response = await this.apiClient.getSubscription(
      product.packageName,
      dto.purchaseToken,
    );
    const mapped = mapSubscription(response);
    // Google 응답 원본을 감사/재처리용으로 보존. 구조화 interface는 Prisma Json 입력 타입으로 캐스팅.
    const rawResponse = response as unknown as Prisma.InputJsonValue;

    await this.prisma.googlePlaySubscription.upsert({
      where: { purchaseToken: dto.purchaseToken },
      create: {
        userId,
        productId: dto.productId,
        purchaseToken: dto.purchaseToken,
        status: mapped.status,
        startedAt: mapped.startedAt,
        expiresAt: mapped.expiresAt,
        autoRenewEnabled: mapped.autoRenewEnabled,
        acknowledged: mapped.acknowledged,
        testPurchase: mapped.testPurchase,
        linkedPurchaseToken: mapped.linkedPurchaseToken,
        lastVerifiedAt: new Date(),
        rawResponse,
      },
      update: {
        status: mapped.status,
        startedAt: mapped.startedAt,
        expiresAt: mapped.expiresAt,
        autoRenewEnabled: mapped.autoRenewEnabled,
        acknowledged: mapped.acknowledged,
        testPurchase: mapped.testPurchase,
        linkedPurchaseToken: mapped.linkedPurchaseToken,
        lastVerifiedAt: new Date(),
        rawResponse,
      },
    });

    // TODO(6번): 미승인(acknowledged=false)이면 Google acknowledge 호출 (3일 내 미승인 시 자동 환불)
    // TODO: GooglePlayTransaction(orderId, 금액) 기록 — 금액은 별도 소스/ RTDN 필요

    const plan = await this.planResolution.syncUserPlan(userId);

    return { plan, status: mapped.status, expiresAt: mapped.expiresAt };
  }
}
