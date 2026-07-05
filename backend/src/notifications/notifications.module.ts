import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AgreementsModule } from '../agreements/agreements.module';
import { FirebaseAdminService } from './firebase-admin.service';
import { FcmNotificationService } from './fcm-notification.service';
import { NotificationWorkerService } from './notification-worker.service';
import { PushTokenController } from './push-token.controller';
import { PushTokenService } from './push-token.service';

@Module({
  imports: [AgreementsModule, ScheduleModule.forRoot()],
  controllers: [PushTokenController],
  providers: [
    FirebaseAdminService,
    FcmNotificationService,
    NotificationWorkerService,
    PushTokenService,
  ],
})
export class NotificationsModule {}
