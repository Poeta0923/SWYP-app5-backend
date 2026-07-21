import { UserPlan } from '../../generated/prisma/client';

// 요금제 tier 오름차순(무료 → 유료 상위). DB 조회 순서에 의존하지 않는 표시/비교용 기준.
export const PLAN_ORDER: UserPlan[] = [
  UserPlan.Basic,
  UserPlan.Pro,
  UserPlan.Premium,
];

/** 요금제의 tier 순위. 값이 클수록 상위 플랜(Basic=0, Pro=1, Premium=2). */
export function planRank(plan: UserPlan): number {
  return PLAN_ORDER.indexOf(plan);
}
