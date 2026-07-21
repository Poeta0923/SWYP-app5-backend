import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GoogleSubscriptionStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EXPIRY_SWEEP_BATCH_SIZE } from './billing.constants';
import {
  ENTITLED_STATUSES,
  PlanResolutionService,
} from './plan-resolution.service';

/**
 * 만료 스윕 안전망. RTDN이 대부분 EXPIRED를 통보하지만, 알림 유실 시 만료된 구독이
 * ACTIVE로 남아 User.plan이 프리미엄에 고착될 수 있다. 주기적으로 만료 지난 "권한 유지"
 * 상태의 구독을 EXPIRED로 내리고 해당 유저의 plan을 재평가한다.
 */
@Injectable()
export class SubscriptionExpirySweepService {
  private readonly logger = new Logger(SubscriptionExpirySweepService.name);
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly planResolution: PlanResolutionService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sweepExpiredSubscriptions(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const now = new Date();
      // 권한 유지 상태인데 이미 만료된 구독 = 상태 갱신이 누락된 stale 행.
      const stale = await this.prisma.googlePlaySubscription.findMany({
        where: {
          status: { in: ENTITLED_STATUSES },
          expiresAt: { lt: now },
        },
        select: { id: true, userId: true },
        take: EXPIRY_SWEEP_BATCH_SIZE,
      });
      if (stale.length === 0) return;

      // 상태를 EXPIRED로 확정해 다음 스윕에서 다시 잡히지 않게 한다.
      await this.prisma.googlePlaySubscription.updateMany({
        where: { id: { in: stale.map((s) => s.id) } },
        data: { status: GoogleSubscriptionStatus.EXPIRED },
      });

      // 영향받은 유저별로 plan 재평가(중복 제거).
      const userIds = [...new Set(stale.map((s) => s.userId))];
      for (const userId of userIds) {
        await this.planResolution.syncUserPlan(userId, now);
      }

      this.logger.log(
        `만료 스윕: 구독 ${stale.length}건 EXPIRED 처리, 유저 ${userIds.length}명 plan 재평가`,
      );
    } finally {
      this.isProcessing = false;
    }
  }
}
