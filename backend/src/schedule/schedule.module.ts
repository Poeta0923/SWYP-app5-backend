import { Module } from '@nestjs/common';
import { AgreementsModule } from '../agreements/agreements.module';
import { S3Module } from '../s3/s3.module';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';

@Module({
  imports: [AgreementsModule, S3Module],
  controllers: [ScheduleController],
  providers: [ScheduleService],
})
export class ScheduleModule {}
