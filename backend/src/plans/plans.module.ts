import { Module } from '@nestjs/common';
import { AgreementsModule } from '../agreements/agreements.module';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';

@Module({
  imports: [AgreementsModule],
  controllers: [PlansController],
  providers: [PlansService],
})
export class PlansModule {}
