import { GoogleSubscriptionStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlanResolutionService } from './plan-resolution.service';
import { SubscriptionExpirySweepService } from './subscription-expiry-sweep.service';

interface PrismaMock {
  googlePlaySubscription: { findMany: jest.Mock; updateMany: jest.Mock };
}

describe('SubscriptionExpirySweepService', () => {
  let prisma: PrismaMock;
  let planResolution: { syncUserPlan: jest.Mock };
  let sweep: SubscriptionExpirySweepService;

  beforeEach(() => {
    prisma = {
      googlePlaySubscription: { findMany: jest.fn(), updateMany: jest.fn() },
    };
    planResolution = { syncUserPlan: jest.fn() };
    sweep = new SubscriptionExpirySweepService(
      prisma as unknown as PrismaService,
      planResolution as unknown as PlanResolutionService,
    );
  });

  it('만료된 구독을 EXPIRED로 내리고 유저별 plan을 재평가한다', async () => {
    prisma.googlePlaySubscription.findMany.mockResolvedValue([
      { id: 'sub-1', userId: 'user-1' },
      { id: 'sub-2', userId: 'user-2' },
    ]);

    await sweep.sweepExpiredSubscriptions();

    expect(prisma.googlePlaySubscription.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['sub-1', 'sub-2'] } },
      data: { status: GoogleSubscriptionStatus.EXPIRED },
    });
    expect(planResolution.syncUserPlan).toHaveBeenCalledWith(
      'user-1',
      expect.any(Date),
    );
    expect(planResolution.syncUserPlan).toHaveBeenCalledWith(
      'user-2',
      expect.any(Date),
    );
    expect(planResolution.syncUserPlan).toHaveBeenCalledTimes(2);
  });

  it('같은 유저의 구독이 여러 개면 syncUserPlan은 1회만', async () => {
    prisma.googlePlaySubscription.findMany.mockResolvedValue([
      { id: 'sub-1', userId: 'user-1' },
      { id: 'sub-2', userId: 'user-1' },
    ]);

    await sweep.sweepExpiredSubscriptions();

    expect(planResolution.syncUserPlan).toHaveBeenCalledTimes(1);
    expect(planResolution.syncUserPlan).toHaveBeenCalledWith(
      'user-1',
      expect.any(Date),
    );
  });

  it('대상이 없으면 update·재평가 안 함', async () => {
    prisma.googlePlaySubscription.findMany.mockResolvedValue([]);

    await sweep.sweepExpiredSubscriptions();

    expect(prisma.googlePlaySubscription.updateMany).not.toHaveBeenCalled();
    expect(planResolution.syncUserPlan).not.toHaveBeenCalled();
  });

  it('겹침 방지: 이미 처리 중이면 폴링하지 않는다', async () => {
    (sweep as unknown as { isProcessing: boolean }).isProcessing = true;

    await sweep.sweepExpiredSubscriptions();

    expect(prisma.googlePlaySubscription.findMany).not.toHaveBeenCalled();
  });
});
