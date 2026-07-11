import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from './common/logger/logger.module';
import { MetricsModule } from './common/metrics/metrics.module';
import { RedisModule } from './redis/redis.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AgreementsModule } from './agreements/agreements.module';
import { PeopleModule } from './people/people.module';
import { S3Module } from './s3/s3.module';
import { HomeModule } from './home/home.module';
import { UsersModule } from './users/users.module';
import { RecordModule } from './record/record.module';
import { ScheduleModule } from './schedule/schedule.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrivacyModule } from './privacy/privacy.module';
import { PlansModule } from './plans/plans.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrivacyModule,
    LoggerModule,
    MetricsModule,
    RedisModule,
    PrismaModule,
    AuthModule,
    AgreementsModule,
    PeopleModule,
    S3Module,
    HomeModule,
    UsersModule,
    RecordModule,
    ScheduleModule,
    NotificationsModule,
    PlansModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
