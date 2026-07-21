import {
  GoogleSubscriptionStatus,
  RtdnEventStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GooglePlayApiClient } from './google-play-api.client';
import { GooglePlayRtdnWorkerService } from './google-play-rtdn-worker.service';
import { DeveloperNotification } from './google-play-rtdn.types';
import { PlanResolutionService } from './plan-resolution.service';

interface PrismaMock {
  googlePlayRtdnEvent: { findMany: jest.Mock; update: jest.Mock };
  googlePlaySubscription: { findUnique: jest.Mock; update: jest.Mock };
}

// event.payload에 담길 DeveloperNotification 객체를 만든다.
function subscriptionPayload(purchaseToken: string): DeveloperNotification {
  return {
    packageName: 'app.linker.relation',
    subscriptionNotification: {
      notificationType: 2,
      purchaseToken,
      subscriptionId: 'pro_monthly',
    },
  };
}

describe('GooglePlayRtdnWorkerService', () => {
  let prisma: PrismaMock;
  let apiClient: { getSubscription: jest.Mock };
  let planResolution: { syncUserPlan: jest.Mock };
  let worker: GooglePlayRtdnWorkerService;

  beforeEach(() => {
    prisma = {
      googlePlayRtdnEvent: { findMany: jest.fn(), update: jest.fn() },
      googlePlaySubscription: { findUnique: jest.fn(), update: jest.fn() },
    };
    apiClient = { getSubscription: jest.fn() };
    planResolution = { syncUserPlan: jest.fn() };
    worker = new GooglePlayRtdnWorkerService(
      prisma as unknown as PrismaService,
      apiClient as unknown as GooglePlayApiClient,
      planResolution as unknown as PlanResolutionService,
    );
  });

  /** 단일 이벤트를 큐에 넣고 워커를 1회 돌린다. */
  function queue(payload: DeveloperNotification) {
    prisma.googlePlayRtdnEvent.findMany.mockResolvedValue([
      {
        id: 'evt-1',
        purchaseToken: null,
        packageName: 'app.linker.relation',
        payload,
      },
    ]);
  }

  /** 이벤트 evt-1의 최종 상태로 update된 값을 뽑는다(PROCESSING 마킹 제외). */
  function finalStatus(): RtdnEventStatus {
    const calls = prisma.googlePlayRtdnEvent.update.mock.calls;
    return calls[calls.length - 1][0].data.status;
  }

  it('subscription 알림: 구독 재조회 → update → syncUserPlan → PROCESSED', async () => {
    queue(subscriptionPayload('token-1'));
    prisma.googlePlaySubscription.findUnique.mockResolvedValue({
      userId: 'user-1',
    });
    apiClient.getSubscription.mockResolvedValue({
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      lineItems: [{ expiryTime: '2026-08-01T00:00:00Z' }],
    });
    planResolution.syncUserPlan.mockResolvedValue('Pro');

    await worker.processDueEvents();

    expect(apiClient.getSubscription).toHaveBeenCalledWith(
      'app.linker.relation',
      'token-1',
    );
    expect(prisma.googlePlaySubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { purchaseToken: 'token-1' },
        data: expect.objectContaining({
          status: GoogleSubscriptionStatus.ACTIVE,
          expiresAt: new Date('2026-08-01T00:00:00Z'),
        }),
      }),
    );
    expect(planResolution.syncUserPlan).toHaveBeenCalledWith('user-1');
    expect(finalStatus()).toBe(RtdnEventStatus.PROCESSED);
  });

  it('매칭되는 구독이 없으면 IGNORED, Google 호출 안 함', async () => {
    queue(subscriptionPayload('unknown-token'));
    prisma.googlePlaySubscription.findUnique.mockResolvedValue(null);

    await worker.processDueEvents();

    expect(apiClient.getSubscription).not.toHaveBeenCalled();
    expect(finalStatus()).toBe(RtdnEventStatus.IGNORED);
  });

  it('voided 알림: 구독을 REVOKED로 내리고 syncUserPlan → PROCESSED', async () => {
    queue({ voidedPurchaseNotification: { purchaseToken: 'token-2' } });
    prisma.googlePlaySubscription.findUnique.mockResolvedValue({
      userId: 'user-2',
    });

    await worker.processDueEvents();

    expect(prisma.googlePlaySubscription.update).toHaveBeenCalledWith({
      where: { purchaseToken: 'token-2' },
      data: { status: GoogleSubscriptionStatus.REVOKED },
    });
    expect(planResolution.syncUserPlan).toHaveBeenCalledWith('user-2');
    expect(finalStatus()).toBe(RtdnEventStatus.PROCESSED);
  });

  it('test 알림은 IGNORED', async () => {
    queue({ testNotification: {} });

    await worker.processDueEvents();

    expect(apiClient.getSubscription).not.toHaveBeenCalled();
    expect(finalStatus()).toBe(RtdnEventStatus.IGNORED);
  });

  it('처리 중 예외 → FAILED + retryCount 증가', async () => {
    queue(subscriptionPayload('token-1'));
    prisma.googlePlaySubscription.findUnique.mockResolvedValue({
      userId: 'user-1',
    });
    apiClient.getSubscription.mockRejectedValue(new Error('google down'));

    await worker.processDueEvents();

    const last = prisma.googlePlayRtdnEvent.update.mock.calls.at(-1)![0];
    expect(last.data.status).toBe(RtdnEventStatus.FAILED);
    expect(last.data.retryCount).toEqual({ increment: 1 });
    expect(last.data.errorMessage).toContain('google down');
  });

  it('겹침 방지: 이미 처리 중이면 폴링하지 않는다', async () => {
    (worker as unknown as { isProcessing: boolean }).isProcessing = true;

    await worker.processDueEvents();

    expect(prisma.googlePlayRtdnEvent.findMany).not.toHaveBeenCalled();
  });
});
