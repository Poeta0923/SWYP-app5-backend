import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  NotificationStatus,
  NotificationType,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FcmNotificationService } from './fcm-notification.service';

const NOTIFICATION_JOB_BATCH_SIZE = 20;

type ScheduleNotificationJob = {
  id: string;
  userId: string;
  attemptCount: number;
  schedule: {
    id: string;
    title: string;
    scheduleTime: Date;
  } | null;
};

@Injectable()
export class NotificationWorkerService {
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly fcmNotificationService: FcmNotificationService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processDueScheduleNotifications(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      const jobs = await this.prisma.notificationJob.findMany({
        where: {
          status: NotificationStatus.PENDING,
          type: NotificationType.SCHEDULE,
          scheduledAt: {
            lte: new Date(),
          },
        },
        select: {
          id: true,
          userId: true,
          attemptCount: true,
          schedule: {
            select: {
              id: true,
              title: true,
              scheduleTime: true,
            },
          },
        },
        orderBy: {
          scheduledAt: Prisma.SortOrder.asc,
        },
        take: NOTIFICATION_JOB_BATCH_SIZE,
      });

      for (const job of jobs) {
        await this.processScheduleNotificationJob(job);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async processScheduleNotificationJob(
    job: ScheduleNotificationJob,
  ): Promise<void> {
    const attemptedAt = new Date();

    if (!job.schedule) {
      await this.markJobFailed(job, {
        attemptedAt,
        errorCode: 'SCHEDULE_NOT_FOUND',
        errorMessage: '알림을 보낼 일정을 찾을 수 없습니다.',
      });
      return;
    }

    const result =
      await this.fcmNotificationService.sendScheduleNotification({
        userId: job.userId,
        scheduleId: job.schedule.id,
        title: job.schedule.title,
        body: this.toScheduleNotificationBody(job.schedule.scheduleTime),
      });

    if (result.successCount > 0) {
      await this.prisma.notificationJob.update({
        where: {
          id: job.id,
        },
        data: {
          status: NotificationStatus.SENT,
          attemptCount: {
            increment: 1,
          },
          sentAt: attemptedAt,
          failedAt: null,
          lastAttemptAt: attemptedAt,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
        },
      });
      return;
    }

    await this.markJobFailed(job, {
      attemptedAt,
      errorCode: result.errorCode ?? 'FCM_SEND_FAILED',
      errorMessage: result.errorMessage ?? 'FCM 발송에 실패했습니다.',
    });
  }

  private async markJobFailed(
    job: Pick<ScheduleNotificationJob, 'id'>,
    params: {
      attemptedAt: Date;
      errorCode: string;
      errorMessage: string;
    },
  ): Promise<void> {
    await this.prisma.notificationJob.update({
      where: {
        id: job.id,
      },
      data: {
        status: NotificationStatus.FAILED,
        attemptCount: {
          increment: 1,
        },
        failedAt: params.attemptedAt,
        lastAttemptAt: params.attemptedAt,
        errorCode: params.errorCode,
        errorMessage: params.errorMessage,
      },
    });
  }

  private toScheduleNotificationBody(scheduleTime: Date): string {
    return `${scheduleTime.toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      dateStyle: 'medium',
      timeStyle: 'short',
    })} 일정이 예정되어 있습니다.`;
  }
}
