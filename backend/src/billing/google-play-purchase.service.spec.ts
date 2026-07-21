import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  GoogleSubscriptionStatus,
  UserPlan,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GooglePlayApiClient } from './google-play-api.client';
import { GooglePlayPurchaseService } from './google-play-purchase.service';
import { SubscriptionPurchaseV2 } from './google-subscription.mapper';
import { PlanResolutionService } from './plan-resolution.service';

interface PrismaMock {
  googlePlayProduct: { findUnique: jest.Mock };
  googlePlaySubscription: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
    update: jest.Mock;
  };
}

describe('GooglePlayPurchaseService', () => {
  let prisma: PrismaMock;
  let apiClient: {
    getSubscription: jest.Mock;
    acknowledgeSubscription: jest.Mock;
  };
  let planResolution: { syncUserPlan: jest.Mock };
  let service: GooglePlayPurchaseService;

  const dto = { productId: 'pro_monthly', purchaseToken: 'token-abc' };
  // acknowledgementState가 없으므로 mapped.acknowledged = false
  const activeResponse: SubscriptionPurchaseV2 = {
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    lineItems: [{ expiryTime: '2026-08-01T00:00:00Z' }],
  };
  const activeProduct = {
    productId: 'pro_monthly',
    packageName: 'app.linker.relation',
    active: true,
  };

  beforeEach(() => {
    prisma = {
      googlePlayProduct: { findUnique: jest.fn() },
      googlePlaySubscription: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
    };
    apiClient = {
      getSubscription: jest.fn(),
      acknowledgeSubscription: jest.fn(),
    };
    planResolution = { syncUserPlan: jest.fn() };
    service = new GooglePlayPurchaseService(
      prisma as unknown as PrismaService,
      apiClient as unknown as GooglePlayApiClient,
      planResolution as unknown as PlanResolutionService,
    );
  });

  it('등록되지 않은 상품이면 NotFoundException, Google 호출 안 함', async () => {
    prisma.googlePlayProduct.findUnique.mockResolvedValue(null);

    await expect(service.verifyPurchase('user-1', dto)).rejects.toThrow(
      NotFoundException,
    );
    expect(apiClient.getSubscription).not.toHaveBeenCalled();
  });

  it('비활성 상품이면 NotFoundException', async () => {
    prisma.googlePlayProduct.findUnique.mockResolvedValue({
      productId: 'pro_monthly',
      packageName: 'app.linker.relation',
      active: false,
    });

    await expect(service.verifyPurchase('user-1', dto)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('다른 유저가 이미 등록한 purchaseToken이면 ForbiddenException', async () => {
    prisma.googlePlayProduct.findUnique.mockResolvedValue({
      productId: 'pro_monthly',
      packageName: 'app.linker.relation',
      active: true,
    });
    prisma.googlePlaySubscription.findUnique.mockResolvedValue({
      userId: 'other-user',
    });

    await expect(service.verifyPurchase('user-1', dto)).rejects.toThrow(
      ForbiddenException,
    );
    expect(apiClient.getSubscription).not.toHaveBeenCalled();
  });

  it('정상 흐름: Google 검증 → 매핑된 값으로 upsert → syncUserPlan → 결과 반환', async () => {
    prisma.googlePlayProduct.findUnique.mockResolvedValue(activeProduct);
    prisma.googlePlaySubscription.findUnique.mockResolvedValue(null);
    apiClient.getSubscription.mockResolvedValue(activeResponse);
    prisma.googlePlaySubscription.upsert.mockResolvedValue({});
    planResolution.syncUserPlan.mockResolvedValue(UserPlan.Pro);

    const result = await service.verifyPurchase('user-1', dto);

    // 서버가 보유한 packageName으로 Google을 호출한다(클라이언트 값 신뢰 안 함)
    expect(apiClient.getSubscription).toHaveBeenCalledWith(
      'app.linker.relation',
      'token-abc',
    );

    // upsert에 매핑된 status/expiresAt과 소유자 정보가 담겼는지
    const upsertArg = prisma.googlePlaySubscription.upsert.mock.calls[0][0];
    expect(upsertArg.where).toEqual({ purchaseToken: 'token-abc' });
    expect(upsertArg.create).toMatchObject({
      userId: 'user-1',
      productId: 'pro_monthly',
      status: GoogleSubscriptionStatus.ACTIVE,
      expiresAt: new Date('2026-08-01T00:00:00Z'),
    });

    // resolution이 해당 유저로 호출되고, 그 결과가 응답 plan이 된다
    expect(planResolution.syncUserPlan).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({
      plan: UserPlan.Pro,
      status: GoogleSubscriptionStatus.ACTIVE,
      expiresAt: new Date('2026-08-01T00:00:00Z'),
    });
  });

  it('미승인 구매면 acknowledge 호출 후 acknowledged=true로 갱신', async () => {
    prisma.googlePlayProduct.findUnique.mockResolvedValue(activeProduct);
    prisma.googlePlaySubscription.findUnique.mockResolvedValue(null);
    apiClient.getSubscription.mockResolvedValue(activeResponse);
    prisma.googlePlaySubscription.upsert.mockResolvedValue({});
    planResolution.syncUserPlan.mockResolvedValue(UserPlan.Pro);

    await service.verifyPurchase('user-1', dto);

    expect(apiClient.acknowledgeSubscription).toHaveBeenCalledWith(
      'app.linker.relation',
      'pro_monthly',
      'token-abc',
    );
    expect(prisma.googlePlaySubscription.update).toHaveBeenCalledWith({
      where: { purchaseToken: 'token-abc' },
      data: { acknowledged: true },
    });
  });

  it('이미 승인된 구매면 acknowledge 호출 안 함', async () => {
    prisma.googlePlayProduct.findUnique.mockResolvedValue(activeProduct);
    prisma.googlePlaySubscription.findUnique.mockResolvedValue(null);
    apiClient.getSubscription.mockResolvedValue({
      ...activeResponse,
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    });
    prisma.googlePlaySubscription.upsert.mockResolvedValue({});
    planResolution.syncUserPlan.mockResolvedValue(UserPlan.Pro);

    await service.verifyPurchase('user-1', dto);

    expect(apiClient.acknowledgeSubscription).not.toHaveBeenCalled();
    expect(prisma.googlePlaySubscription.update).not.toHaveBeenCalled();
  });

  it('PENDING(결제 대기)이면 acknowledge 호출 안 함', async () => {
    prisma.googlePlayProduct.findUnique.mockResolvedValue(activeProduct);
    prisma.googlePlaySubscription.findUnique.mockResolvedValue(null);
    apiClient.getSubscription.mockResolvedValue({
      subscriptionState: 'SUBSCRIPTION_STATE_PENDING',
    });
    prisma.googlePlaySubscription.upsert.mockResolvedValue({});
    planResolution.syncUserPlan.mockResolvedValue(UserPlan.Basic);

    await service.verifyPurchase('user-1', dto);

    expect(apiClient.acknowledgeSubscription).not.toHaveBeenCalled();
  });

  it('같은 유저가 재검증하면(토큰 소유자 일치) 통과해 upsert된다', async () => {
    prisma.googlePlayProduct.findUnique.mockResolvedValue({
      productId: 'pro_monthly',
      packageName: 'app.linker.relation',
      active: true,
    });
    prisma.googlePlaySubscription.findUnique.mockResolvedValue({
      userId: 'user-1',
    });
    apiClient.getSubscription.mockResolvedValue(activeResponse);
    prisma.googlePlaySubscription.upsert.mockResolvedValue({});
    planResolution.syncUserPlan.mockResolvedValue(UserPlan.Pro);

    await expect(service.verifyPurchase('user-1', dto)).resolves.toMatchObject({
      plan: UserPlan.Pro,
    });
    expect(prisma.googlePlaySubscription.upsert).toHaveBeenCalled();
  });
});
