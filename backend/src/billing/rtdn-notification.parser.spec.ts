import { DeveloperNotification } from './google-play-rtdn.types';
import {
  classifyNotification,
  parseEnvelope,
} from './rtdn-notification.parser';

/** DeveloperNotification 객체를 Pub/Sub envelope로 감싼다(base64 인코딩). */
function envelope(
  notification: DeveloperNotification,
  overrides: { messageId?: string; publishTime?: string } = {},
) {
  return {
    message: {
      data: Buffer.from(JSON.stringify(notification)).toString('base64'),
      messageId: overrides.messageId ?? 'msg-1',
      publishTime: overrides.publishTime ?? '2026-07-21T00:00:00Z',
    },
  };
}

describe('parseEnvelope', () => {
  it('base64 data를 디코드해 notification과 messageId를 반환한다', () => {
    const notification: DeveloperNotification = {
      packageName: 'app.linker.relation',
      eventTimeMillis: '1700000000000',
      subscriptionNotification: {
        notificationType: 2,
        purchaseToken: 'token-1',
        subscriptionId: 'pro_monthly',
      },
    };

    const parsed = parseEnvelope(envelope(notification, { messageId: 'm-9' }));

    expect(parsed.messageId).toBe('m-9');
    expect(parsed.notification.packageName).toBe('app.linker.relation');
    expect(parsed.publishTime).toEqual(new Date('2026-07-21T00:00:00Z'));
  });

  it('messageId나 data가 없으면 에러', () => {
    expect(() => parseEnvelope({ message: { messageId: 'x' } })).toThrow();
    expect(() => parseEnvelope({})).toThrow();
  });

  it('base64/JSON 디코드 실패 시 에러', () => {
    expect(() =>
      parseEnvelope({
        message: { messageId: 'x', data: 'not-valid-base64-#' },
      }),
    ).toThrow();
  });
});

describe('classifyNotification', () => {
  it('subscriptionNotification → subscription', () => {
    const result = classifyNotification({
      subscriptionNotification: {
        notificationType: 3,
        purchaseToken: 'token-1',
        subscriptionId: 'pro_monthly',
      },
    });

    expect(result).toEqual({
      kind: 'subscription',
      purchaseToken: 'token-1',
      notificationType: 3,
      subscriptionId: 'pro_monthly',
    });
  });

  it('voidedPurchaseNotification → voided', () => {
    const result = classifyNotification({
      voidedPurchaseNotification: { purchaseToken: 'token-2' },
    });

    expect(result).toEqual({ kind: 'voided', purchaseToken: 'token-2' });
  });

  it('testNotification → test', () => {
    expect(classifyNotification({ testNotification: {} })).toEqual({
      kind: 'test',
    });
  });

  it('purchaseToken 없는 subscription은 unknown', () => {
    expect(
      classifyNotification({
        subscriptionNotification: { notificationType: 2 },
      }),
    ).toEqual({ kind: 'unknown' });
  });

  it('빈 알림은 unknown', () => {
    expect(classifyNotification({})).toEqual({ kind: 'unknown' });
  });
});
