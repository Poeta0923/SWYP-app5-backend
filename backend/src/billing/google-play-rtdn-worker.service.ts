import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  GoogleSubscriptionStatus,
  Prisma,
  RtdnEventStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RTDN_EVENT_BATCH_SIZE, RTDN_MAX_RETRY } from './billing.constants';
import { GooglePlayApiClient } from './google-play-api.client';
import { DeveloperNotification } from './google-play-rtdn.types';
import { mapSubscription } from './google-subscription.mapper';
import { PlanResolutionService } from './plan-resolution.service';
import { classifyNotification } from './rtdn-notification.parser';

type DueRtdnEvent = {
  id: string;
  purchaseToken: string | null;
  packageName: string | null;
  payload: Prisma.JsonValue;
};

@Injectable()
export class GooglePlayRtdnWorkerService {
  private readonly logger = new Logger(GooglePlayRtdnWorkerService.name);
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly apiClient: GooglePlayApiClient,
    private readonly planResolution: PlanResolutionService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processDueEvents(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const events = await this.prisma.googlePlayRtdnEvent.findMany({
        where: {
          status: { in: [RtdnEventStatus.RECEIVED, RtdnEventStatus.FAILED] },
          retryCount: { lt: RTDN_MAX_RETRY },
        },
        select: {
          id: true,
          purchaseToken: true,
          packageName: true,
          payload: true,
        },
        orderBy: { createdAt: Prisma.SortOrder.asc },
        take: RTDN_EVENT_BATCH_SIZE,
      });

      for (const event of events) {
        await this.processEvent(event);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async processEvent(event: DueRtdnEvent): Promise<void> {
    await this.prisma.googlePlayRtdnEvent.update({
      where: { id: event.id },
      data: { status: RtdnEventStatus.PROCESSING },
    });

    try {
      const status = await this.handle(event);
      await this.prisma.googlePlayRtdnEvent.update({
        where: { id: event.id },
        data: { status, processedAt: new Date(), errorMessage: null },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`RTDN 이벤트 처리 실패(${event.id}): ${message}`);
      await this.prisma.googlePlayRtdnEvent.update({
        where: { id: event.id },
        data: {
          status: RtdnEventStatus.FAILED,
          retryCount: { increment: 1 },
          errorMessage: message,
        },
      });
    }
  }

  /** 이벤트 1건을 처리하고 최종 상태(PROCESSED/IGNORED)를 반환한다. */
  private async handle(event: DueRtdnEvent): Promise<RtdnEventStatus> {
    const notification = event.payload as unknown as DeveloperNotification;
    const classified = classifyNotification(notification);

    if (classified.kind === 'subscription') {
      return this.reconcileSubscription(
        classified.purchaseToken,
        notification.packageName ?? event.packageName,
      );
    }

    if (classified.kind === 'voided') {
      return this.revoke(classified.purchaseToken);
    }

    // test/unknown 알림은 처리 대상 아님.
    return RtdnEventStatus.IGNORED;
  }

  /** purchaseToken으로 기존 구독을 찾아 Google 최신 상태로 재동기화한다(reconcile-only). */
  private async reconcileSubscription(
    purchaseToken: string,
    packageName: string | null,
  ): Promise<RtdnEventStatus> {
    const subscription = await this.prisma.googlePlaySubscription.findUnique({
      where: { purchaseToken },
      select: { userId: true },
    });

    // verify-first 전제: 앱 검증으로 생성되지 않은 토큰은 귀속 불가 → 무시.
    // TODO: linkedPurchaseToken으로 유저를 역추적하는 fallback
    if (!subscription) return RtdnEventStatus.IGNORED;
    if (!packageName) {
      throw new Error('RTDN subscription 알림에 packageName이 없습니다.');
    }

    const response = await this.apiClient.getSubscription(
      packageName,
      purchaseToken,
    );
    const mapped = mapSubscription(response);

    await this.prisma.googlePlaySubscription.update({
      where: { purchaseToken },
      data: {
        status: mapped.status,
        startedAt: mapped.startedAt,
        expiresAt: mapped.expiresAt,
        autoRenewEnabled: mapped.autoRenewEnabled,
        acknowledged: mapped.acknowledged,
        testPurchase: mapped.testPurchase,
        linkedPurchaseToken: mapped.linkedPurchaseToken,
        lastVerifiedAt: new Date(),
        rawResponse: response as unknown as Prisma.InputJsonValue,
      },
    });

    await this.planResolution.syncUserPlan(subscription.userId);
    return RtdnEventStatus.PROCESSED;
  }

  /** 환불/차지백. 구독을 REVOKED로 내리고 plan을 재평가한다. */
  private async revoke(purchaseToken: string): Promise<RtdnEventStatus> {
    const subscription = await this.prisma.googlePlaySubscription.findUnique({
      where: { purchaseToken },
      select: { userId: true },
    });
    if (!subscription) return RtdnEventStatus.IGNORED;

    await this.prisma.googlePlaySubscription.update({
      where: { purchaseToken },
      data: { status: GoogleSubscriptionStatus.REVOKED },
    });

    await this.planResolution.syncUserPlan(subscription.userId);
    return RtdnEventStatus.PROCESSED;
  }
}
