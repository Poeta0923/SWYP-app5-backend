import { Module } from '@nestjs/common';
import { AgreementsModule } from '../agreements/agreements.module';
import { BillingController } from './billing.controller';
import { GooglePlayApiClient } from './google-play-api.client';
import { GooglePlayPurchaseService } from './google-play-purchase.service';
import { PlanResolutionService } from './plan-resolution.service';

// 구글 인앱 결제(구독) 도메인. PrismaModule은 @Global이라 별도 import 불필요.
@Module({
  imports: [AgreementsModule],
  controllers: [BillingController],
  providers: [
    PlanResolutionService,
    GooglePlayApiClient,
    GooglePlayPurchaseService,
  ],
  exports: [PlanResolutionService],
})
export class BillingModule {}
