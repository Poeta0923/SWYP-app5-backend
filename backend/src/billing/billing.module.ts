import { Module } from '@nestjs/common';
import { AgreementsModule } from '../agreements/agreements.module';
import { BillingController } from './billing.controller';
import { GooglePlayApiClient } from './google-play-api.client';
import { GooglePlayPurchaseService } from './google-play-purchase.service';
import { GooglePlayRtdnController } from './google-play-rtdn.controller';
import { GooglePlayRtdnSecretGuard } from './google-play-rtdn-secret.guard';
import { GooglePlayRtdnService } from './google-play-rtdn.service';
import { GooglePlayRtdnWorkerService } from './google-play-rtdn-worker.service';
import { PlanResolutionService } from './plan-resolution.service';
import { SubscriptionExpirySweepService } from './subscription-expiry-sweep.service';

// 구글 인앱 결제(구독) 도메인. PrismaModule은 @Global이라 별도 import 불필요.
// @Cron 워커는 NotificationsModule의 ScheduleModule.forRoot()가 앱 전역 스캔하므로
// 여기서 forRoot를 재호출하지 않는다(앱당 1회).
@Module({
  imports: [AgreementsModule],
  controllers: [BillingController, GooglePlayRtdnController],
  providers: [
    PlanResolutionService,
    GooglePlayApiClient,
    GooglePlayPurchaseService,
    GooglePlayRtdnService,
    GooglePlayRtdnWorkerService,
    GooglePlayRtdnSecretGuard,
    SubscriptionExpirySweepService,
  ],
  exports: [PlanResolutionService],
})
export class BillingModule {}
