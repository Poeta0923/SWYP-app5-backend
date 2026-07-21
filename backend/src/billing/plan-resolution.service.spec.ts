import {
  GoogleSubscriptionStatus,
  UserPlan,
} from '../../generated/prisma/client';
import { ResolvableSubscription, resolvePlan } from './plan-resolution.service';

describe('resolvePlan', () => {
  // 모든 만료 판정의 기준 시각을 고정해 결정론을 보장한다.
  const now = new Date('2026-07-21T00:00:00.000Z');
  const future = new Date('2026-08-21T00:00:00.000Z');
  const laterFuture = new Date('2026-09-21T00:00:00.000Z');
  const past = new Date('2026-06-21T00:00:00.000Z');

  const sub = (
    status: GoogleSubscriptionStatus,
    planCode: UserPlan,
    expiresAt: Date | null,
  ): ResolvableSubscription => ({ status, planCode, expiresAt });

  it('구독이 없으면 Basic', () => {
    expect(resolvePlan([], now)).toBe(UserPlan.Basic);
  });

  it('ACTIVE Pro 하나면 Pro', () => {
    const subs = [sub(GoogleSubscriptionStatus.ACTIVE, UserPlan.Pro, future)];
    expect(resolvePlan(subs, now)).toBe(UserPlan.Pro);
  });

  it('ACTIVE Pro와 ACTIVE Premium이 겹치면 tier 높은 Premium', () => {
    const subs = [
      sub(GoogleSubscriptionStatus.ACTIVE, UserPlan.Pro, future),
      sub(GoogleSubscriptionStatus.ACTIVE, UserPlan.Premium, future),
    ];
    expect(resolvePlan(subs, now)).toBe(UserPlan.Premium);
  });

  it('동일 tier면 만료가 늦은 구독이 이겨도 결과 plan은 같다', () => {
    const subs = [
      sub(GoogleSubscriptionStatus.ACTIVE, UserPlan.Premium, future),
      sub(GoogleSubscriptionStatus.ACTIVE, UserPlan.Premium, laterFuture),
    ];
    // tie-break이 만료 늦은 쪽을 고르지만 둘 다 Premium이라 plan은 Premium
    expect(resolvePlan(subs, now)).toBe(UserPlan.Premium);
  });

  it('CANCELED여도 만료 전이면 권한 유지', () => {
    const subs = [
      sub(GoogleSubscriptionStatus.CANCELED, UserPlan.Premium, future),
    ];
    expect(resolvePlan(subs, now)).toBe(UserPlan.Premium);
  });

  it('CANCELED이고 이미 만료됐으면 제외 → Basic', () => {
    const subs = [
      sub(GoogleSubscriptionStatus.CANCELED, UserPlan.Premium, past),
    ];
    expect(resolvePlan(subs, now)).toBe(UserPlan.Basic);
  });

  it('GRACE_PERIOD는 권한 유지', () => {
    const subs = [
      sub(GoogleSubscriptionStatus.GRACE_PERIOD, UserPlan.Pro, future),
    ];
    expect(resolvePlan(subs, now)).toBe(UserPlan.Pro);
  });

  it('ACTIVE지만 만료 시각이 지났으면 stale 가드로 제외 → Basic', () => {
    const subs = [sub(GoogleSubscriptionStatus.ACTIVE, UserPlan.Pro, past)];
    expect(resolvePlan(subs, now)).toBe(UserPlan.Basic);
  });

  it('expiresAt이 null이면 만료 판정에서 통과(권한 유지)', () => {
    const subs = [sub(GoogleSubscriptionStatus.ACTIVE, UserPlan.Pro, null)];
    expect(resolvePlan(subs, now)).toBe(UserPlan.Pro);
  });

  it.each([
    GoogleSubscriptionStatus.ON_HOLD,
    GoogleSubscriptionStatus.PAUSED,
    GoogleSubscriptionStatus.PENDING,
    GoogleSubscriptionStatus.EXPIRED,
    GoogleSubscriptionStatus.REVOKED,
    GoogleSubscriptionStatus.UNKNOWN,
  ])('%s 상태는 만료 전이어도 권한 없음 → Basic', (status) => {
    const subs = [sub(status, UserPlan.Premium, future)];
    expect(resolvePlan(subs, now)).toBe(UserPlan.Basic);
  });

  it('권한 없는 구독과 권한 있는 구독이 섞이면 권한 있는 것만 반영', () => {
    const subs = [
      sub(GoogleSubscriptionStatus.EXPIRED, UserPlan.Premium, past),
      sub(GoogleSubscriptionStatus.ACTIVE, UserPlan.Pro, future),
    ];
    expect(resolvePlan(subs, now)).toBe(UserPlan.Pro);
  });
});
