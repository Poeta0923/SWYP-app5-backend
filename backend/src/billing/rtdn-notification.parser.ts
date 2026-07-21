import {
  ClassifiedNotification,
  DeveloperNotification,
  PubSubEnvelope,
} from './google-play-rtdn.types';

/** Pub/Sub envelope에서 추출한 메시지 식별자와 디코드된 알림. */
export interface ParsedRtdnMessage {
  messageId: string;
  publishTime: Date | null;
  notification: DeveloperNotification;
}

/**
 * Pub/Sub envelope를 파싱한다. message.data(base64 JSON)를 디코드해 DeveloperNotification을 얻는다.
 * 순수 함수 — 형식이 어긋나면 명확한 에러를 던진다(호출부에서 400 처리).
 *
 * @throws Error messageId/data 누락 또는 base64·JSON 파싱 실패 시
 */
export function parseEnvelope(body: PubSubEnvelope): ParsedRtdnMessage {
  const message = body.message;
  if (!message?.messageId || !message.data) {
    throw new Error('Invalid Pub/Sub envelope: message.messageId/data 누락');
  }

  let notification: DeveloperNotification;
  try {
    const decoded = Buffer.from(message.data, 'base64').toString('utf-8');
    notification = JSON.parse(decoded) as DeveloperNotification;
  } catch {
    throw new Error('Invalid RTDN payload: base64/JSON 디코드 실패');
  }

  const publishTime = message.publishTime
    ? new Date(message.publishTime)
    : null;

  return {
    messageId: message.messageId,
    publishTime:
      publishTime && !Number.isNaN(publishTime.getTime()) ? publishTime : null,
    notification,
  };
}

/**
 * DeveloperNotification을 종류별로 분류한다. 순수 함수.
 * purchaseToken이 없는 subscription/voided는 처리 불가로 보고 unknown 처리.
 */
export function classifyNotification(
  notification: DeveloperNotification,
): ClassifiedNotification {
  const sub = notification.subscriptionNotification;
  if (sub?.purchaseToken) {
    return {
      kind: 'subscription',
      purchaseToken: sub.purchaseToken,
      notificationType: sub.notificationType,
      subscriptionId: sub.subscriptionId,
    };
  }

  const voided = notification.voidedPurchaseNotification;
  if (voided?.purchaseToken) {
    return { kind: 'voided', purchaseToken: voided.purchaseToken };
  }

  if (notification.testNotification) {
    return { kind: 'test' };
  }

  return { kind: 'unknown' };
}
