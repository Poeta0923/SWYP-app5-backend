import { Injectable } from '@nestjs/common';
import {
  GoogleSubscriptionStatus,
  UserPlan,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { planRank } from '../plans/plan-order';

/** resolvePlan이 판단에 쓰는 최소 구독 정보. status·만료시각·해당 상품의 요금제. */
export interface ResolvableSubscription {
  status: GoogleSubscriptionStatus;
  expiresAt: Date | null;
  planCode: UserPlan;
}

// 권한을 유지하는 구독 상태(Google Play 정책 기준). 이 상태이면서 아직 만료 전인 구독만
// 유료 플랜을 부여한다. ON_HOLD·PAUSED 등은 구글이 접근을 차단하므로 제외한다.
export const ENTITLED_STATUSES: GoogleSubscriptionStatus[] = [
  GoogleSubscriptionStatus.ACTIVE,
  GoogleSubscriptionStatus.GRACE_PERIOD,
  GoogleSubscriptionStatus.CANCELED,
];

/**
 * 유저의 구독 목록을 최종 UserPlan 하나로 접는다. 동일 입력에 항상 동일 결과(결정론적).
 *
 * 권한 유지 구독이 없으면 Basic. 여럿이면 tier 높은 것 우선, 동률이면 만료가 늦은 것.
 * expiresAt 가드는 상태 갱신이 늦은 stale 행(만료됐는데 ACTIVE인 채)을 걸러낸다.
 *
 * @param subscriptions 유저의 구독 목록
 * @param now 만료 판정 기준 시각(테스트 주입용)
 * @returns 확정된 UserPlan
 */
export function resolvePlan(
  subscriptions: ResolvableSubscription[],
  now: Date = new Date(),
): UserPlan {
  const entitled = subscriptions.filter(
    (s) =>
      ENTITLED_STATUSES.includes(s.status) &&
      (s.expiresAt === null || s.expiresAt > now),
  );
  if (entitled.length === 0) return UserPlan.Basic;

  entitled.sort((a, b) => {
    const byTier = planRank(b.planCode) - planRank(a.planCode);
    if (byTier !== 0) return byTier;
    return (
      (b.expiresAt?.getTime() ?? Infinity) -
      (a.expiresAt?.getTime() ?? Infinity)
    );
  });
  return entitled[0].planCode;
}

@Injectable()
export class PlanResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 유저의 구독 이력을 재평가해 User.plan을 갱신한다.
   * 구매 검증·RTDN 처리·만료 스윕에서 공통 호출하는 단일 진입점.
   *
   * @param userId 대상 유저 ID
   * @param now 만료 판정 기준 시각(테스트 주입용)
   * @returns 갱신 후 확정된 UserPlan
   */
  async syncUserPlan(
    userId: string,
    now: Date = new Date(),
  ): Promise<UserPlan> {
    const subs = await this.prisma.googlePlaySubscription.findMany({
      where: { userId },
      select: {
        status: true,
        expiresAt: true,
        product: { select: { planCode: true } },
      },
    });

    const resolved = resolvePlan(
      subs.map((s) => ({
        status: s.status,
        expiresAt: s.expiresAt,
        planCode: s.product.planCode,
      })),
      now,
    );

    // 변경이 있을 때만 write — RTDN 다발 시 불필요한 updatedAt churn 방지
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { plan: true },
    });
    if (current.plan !== resolved) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { plan: resolved },
      });
    }
    return resolved;
  }
}
