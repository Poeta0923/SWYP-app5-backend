import { Module } from '@nestjs/common';
import { PlanResolutionService } from './plan-resolution.service';

// 구글 인앱 결제(구독) 도메인. PrismaModule은 @Global이라 별도 import 불필요.
@Module({
  providers: [PlanResolutionService],
  exports: [PlanResolutionService],
})
export class BillingModule {}
