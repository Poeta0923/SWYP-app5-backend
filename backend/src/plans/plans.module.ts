import { Module } from '@nestjs/common';
import { AgreementsModule } from '../agreements/agreements.module';
import { EntitlementService } from './entitlement.service';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';

@Module({
  imports: [AgreementsModule],
  controllers: [PlansController],
  providers: [PlansService, EntitlementService],
  exports: [EntitlementService],
})
export class PlansModule {}
