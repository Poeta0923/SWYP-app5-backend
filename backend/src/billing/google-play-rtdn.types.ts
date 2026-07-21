// Google Play RTDN(Real-time Developer Notifications) 페이로드 타입.
// Pub/Sub push가 감싼 envelope 안에 base64로 인코딩된 DeveloperNotification이 들어온다.
// 참고: https://developer.android.com/google/play/billing/rtdn-reference

/** Pub/Sub push 메시지 envelope. */
export interface PubSubEnvelope {
  message?: {
    data?: string; // base64(JSON DeveloperNotification)
    messageId?: string;
    publishTime?: string;
  };
  subscription?: string;
}

/** base64 디코드된 RTDN 최상위 페이로드. 셋 중 하나만 채워진다. */
export interface DeveloperNotification {
  version?: string;
  packageName?: string;
  eventTimeMillis?: string;
  subscriptionNotification?: SubscriptionNotification;
  voidedPurchaseNotification?: VoidedPurchaseNotification;
  testNotification?: { version?: string };
}

export interface SubscriptionNotification {
  version?: string;
  notificationType?: number;
  purchaseToken?: string;
  subscriptionId?: string; // 상품 ID
}

export interface VoidedPurchaseNotification {
  purchaseToken?: string;
  orderId?: string;
  productType?: number;
  refundType?: number;
}

/** 파싱된 알림을 종류별로 분류한 결과(discriminated union). */
export type ClassifiedNotification =
  | {
      kind: 'subscription';
      purchaseToken: string;
      notificationType?: number;
      subscriptionId?: string;
    }
  | { kind: 'voided'; purchaseToken: string }
  | { kind: 'test' }
  | { kind: 'unknown' };
