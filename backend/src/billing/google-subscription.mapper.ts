import { GoogleSubscriptionStatus } from '../../generated/prisma/client';

/**
 * Google Play Developer API `purchases.subscriptionsv2.get` 응답 중
 * 우리가 사용하는 필드만 추린 형태. 전체 스키마는 SubscriptionPurchaseV2 참고.
 * 파싱 실패에 관대해야 하므로 대부분 optional.
 */
export interface SubscriptionPurchaseV2 {
  subscriptionState?: string;
  latestOrderId?: string;
  linkedPurchaseToken?: string;
  startTime?: string;
  acknowledgementState?: string;
  testPurchase?: object;
  lineItems?: Array<{
    productId?: string;
    expiryTime?: string;
  }>;
}

/** 검증 응답을 우리 구독 스키마 컬럼으로 정규화한 결과. */
export interface MappedSubscription {
  status: GoogleSubscriptionStatus;
  startedAt: Date | null;
  expiresAt: Date | null;
  autoRenewEnabled: boolean;
  acknowledged: boolean;
  testPurchase: boolean;
  latestOrderId: string | null;
  linkedPurchaseToken: string | null;
}

// Google subscriptionState 문자열 → 우리 GoogleSubscriptionStatus enum.
// subscriptionsv2는 REVOKED를 직접 주지 않는다(RTDN/voidedpurchases로 전달).
const STATE_MAP: Record<string, GoogleSubscriptionStatus> = {
  SUBSCRIPTION_STATE_ACTIVE: GoogleSubscriptionStatus.ACTIVE,
  SUBSCRIPTION_STATE_CANCELED: GoogleSubscriptionStatus.CANCELED,
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD: GoogleSubscriptionStatus.GRACE_PERIOD,
  SUBSCRIPTION_STATE_ON_HOLD: GoogleSubscriptionStatus.ON_HOLD,
  SUBSCRIPTION_STATE_PAUSED: GoogleSubscriptionStatus.PAUSED,
  SUBSCRIPTION_STATE_EXPIRED: GoogleSubscriptionStatus.EXPIRED,
  SUBSCRIPTION_STATE_PENDING: GoogleSubscriptionStatus.PENDING,
};

/** RFC3339 문자열을 Date로. 없거나 파싱 불가면 null. */
function parseTime(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Google subscriptionsv2 응답을 우리 구독 스키마 필드로 매핑한다. 순수 함수.
 *
 * expiresAt은 lineItem들의 expiryTime 중 가장 늦은 값을 쓴다(다중 라인 대비).
 * autoRenewEnabled는 상태로 근사한다: ACTIVE/GRACE_PERIOD면 갱신 예정으로 본다.
 *
 * @param res subscriptionsv2.get 응답(부분)
 */
export function mapSubscription(
  res: SubscriptionPurchaseV2,
): MappedSubscription {
  const status =
    STATE_MAP[res.subscriptionState ?? ''] ?? GoogleSubscriptionStatus.UNKNOWN;

  const expiryTimes = (res.lineItems ?? [])
    .map((item) => parseTime(item.expiryTime))
    .filter((d): d is Date => d !== null);
  const expiresAt =
    expiryTimes.length > 0
      ? new Date(Math.max(...expiryTimes.map((d) => d.getTime())))
      : null;

  return {
    status,
    startedAt: parseTime(res.startTime),
    expiresAt,
    // CANCELED는 사용자가 자동 갱신을 끈 상태이므로 갱신 예정 아님.
    autoRenewEnabled:
      status === GoogleSubscriptionStatus.ACTIVE ||
      status === GoogleSubscriptionStatus.GRACE_PERIOD,
    acknowledged:
      res.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    testPurchase: res.testPurchase !== undefined,
    latestOrderId: res.latestOrderId ?? null,
    linkedPurchaseToken: res.linkedPurchaseToken ?? null,
  };
}
