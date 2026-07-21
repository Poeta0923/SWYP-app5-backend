import { GoogleSubscriptionStatus } from '../../generated/prisma/client';
import {
  mapSubscription,
  SubscriptionPurchaseV2,
} from './google-subscription.mapper';

describe('mapSubscription', () => {
  it('ACTIVE 상태와 lineItem 만료시각을 매핑한다', () => {
    const res: SubscriptionPurchaseV2 = {
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      startTime: '2026-07-01T00:00:00Z',
      latestOrderId: 'GPA.1234',
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
      lineItems: [
        { productId: 'pro_monthly', expiryTime: '2026-08-01T00:00:00Z' },
      ],
    };

    const mapped = mapSubscription(res);

    expect(mapped.status).toBe(GoogleSubscriptionStatus.ACTIVE);
    expect(mapped.startedAt).toEqual(new Date('2026-07-01T00:00:00Z'));
    expect(mapped.expiresAt).toEqual(new Date('2026-08-01T00:00:00Z'));
    expect(mapped.autoRenewEnabled).toBe(true);
    expect(mapped.acknowledged).toBe(true);
    expect(mapped.testPurchase).toBe(false);
    expect(mapped.latestOrderId).toBe('GPA.1234');
  });

  it('여러 lineItem이면 가장 늦은 만료시각을 쓴다', () => {
    const res: SubscriptionPurchaseV2 = {
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      lineItems: [
        { expiryTime: '2026-08-01T00:00:00Z' },
        { expiryTime: '2026-09-01T00:00:00Z' },
      ],
    };

    expect(mapSubscription(res).expiresAt).toEqual(
      new Date('2026-09-01T00:00:00Z'),
    );
  });

  it('CANCELED는 autoRenew를 끈 것으로 본다', () => {
    const mapped = mapSubscription({
      subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
    });

    expect(mapped.status).toBe(GoogleSubscriptionStatus.CANCELED);
    expect(mapped.autoRenewEnabled).toBe(false);
  });

  it('testPurchase 필드가 있으면 true', () => {
    const mapped = mapSubscription({
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      testPurchase: {},
    });

    expect(mapped.testPurchase).toBe(true);
  });

  it('알 수 없는 상태는 UNKNOWN', () => {
    expect(mapSubscription({ subscriptionState: 'SOMETHING_NEW' }).status).toBe(
      GoogleSubscriptionStatus.UNKNOWN,
    );
    expect(mapSubscription({}).status).toBe(GoogleSubscriptionStatus.UNKNOWN);
  });

  it('만료시각이 없으면 expiresAt은 null', () => {
    expect(
      mapSubscription({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE' })
        .expiresAt,
    ).toBeNull();
  });

  it.each([
    [
      'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
      GoogleSubscriptionStatus.GRACE_PERIOD,
    ],
    ['SUBSCRIPTION_STATE_ON_HOLD', GoogleSubscriptionStatus.ON_HOLD],
    ['SUBSCRIPTION_STATE_PAUSED', GoogleSubscriptionStatus.PAUSED],
    ['SUBSCRIPTION_STATE_EXPIRED', GoogleSubscriptionStatus.EXPIRED],
    ['SUBSCRIPTION_STATE_PENDING', GoogleSubscriptionStatus.PENDING],
  ])('%s → %s', (state, expected) => {
    expect(mapSubscription({ subscriptionState: state }).status).toBe(expected);
  });
});
