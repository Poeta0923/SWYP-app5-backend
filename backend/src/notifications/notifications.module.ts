import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AgreementsModule } from '../agreements/agreements.module';
import { FirebaseAdminService } from './firebase-admin.service';
import { FcmNotificationService } from './fcm-notification.service';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationWorkerService } from './notification-worker.service';
import { PushTokenController } from './push-token.controller';
import { PushTokenService } from './push-token.service';

@Module({
  imports: [AgreementsModule, ScheduleModule.forRoot()],
  controllers: [PushTokenController, NotificationController],
  providers: [
    FirebaseAdminService,
    FcmNotificationService,
    NotificationService,
    NotificationWorkerService,
    PushTokenService,
  ],
})
export class NotificationsModule {}
