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
const BIRTHDAY_NOTIFICATION_HOUR_KST = 9;
const KST_OFFSET_HOURS = 9;

type DueNotificationJob = {
  id: string;
  userId: string;
  type: NotificationType;
  dedupeKey: string;
  attemptCount: number;
  schedule: {
    id: string;
    title: string;
    scheduleTime: Date;
  } | null;
  person: {
    id: string;
    name: string;
    birthDate: Date | null;
    birthdayNotificationOffsetMinutes: number;
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
          type: {
            in: [NotificationType.SCHEDULE, NotificationType.BIRTHDAY],
          },
          scheduledAt: {
            lte: new Date(),
          },
        },
        select: {
          id: true,
          userId: true,
          type: true,
          dedupeKey: true,
          attemptCount: true,
          schedule: {
            select: {
              id: true,
              title: true,
              scheduleTime: true,
            },
          },
          person: {
            select: {
              id: true,
              name: true,
              birthDate: true,
              birthdayNotificationOffsetMinutes: true,
            },
          },
        },
        orderBy: {
          scheduledAt: Prisma.SortOrder.asc,
        },
        take: NOTIFICATION_JOB_BATCH_SIZE,
      });

      for (const job of jobs) {
        await this.processNotificationJob(job);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async processNotificationJob(job: DueNotificationJob): Promise<void> {
    if (job.type === NotificationType.BIRTHDAY) {
      await this.processBirthdayNotificationJob(job);
      return;
    }

    await this.processScheduleNotificationJob(job);
  }

  private async processScheduleNotificationJob(
    job: DueNotificationJob,
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

    const result = await this.fcmNotificationService.sendScheduleNotification({
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
    job: Pick<DueNotificationJob, 'id'>,
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

  private async processBirthdayNotificationJob(
    job: DueNotificationJob,
  ): Promise<void> {
    const attemptedAt = new Date();

    if (!job.person || !job.person.birthDate) {
      await this.markJobFailed(job, {
        attemptedAt,
        errorCode: 'PERSON_BIRTHDAY_NOT_FOUND',
        errorMessage: '알림을 보낼 생일 정보를 찾을 수 없습니다.',
      });
      return;
    }

    const result = await this.fcmNotificationService.sendBirthdayNotification({
      userId: job.userId,
      personId: job.person.id,
      title: `${job.person.name}님 생일`,
      body: this.toBirthdayNotificationBody(job.person.name),
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
      await this.scheduleNextBirthdayNotificationJob(job, job.person);
      return;
    }

    await this.markJobFailed(job, {
      attemptedAt,
      errorCode: result.errorCode ?? 'FCM_SEND_FAILED',
      errorMessage: result.errorMessage ?? 'FCM 발송에 실패했습니다.',
    });
  }

  private async scheduleNextBirthdayNotificationJob(
    job: Pick<DueNotificationJob, 'userId' | 'dedupeKey'>,
    person: NonNullable<DueNotificationJob['person']>,
  ): Promise<void> {
    if (!person.birthDate) {
      return;
    }

    const nextYear = this.toBirthdayNotificationYear(job.dedupeKey) + 1;
    const dedupeKey = this.toBirthdayNotificationDedupeKey(person.id, nextYear);

    await this.prisma.notificationJob.upsert({
      where: {
        userId_dedupeKey: {
          userId: job.userId,
          dedupeKey,
        },
      },
      create: {
        userId: job.userId,
        type: NotificationType.BIRTHDAY,
        personId: person.id,
        scheduledAt: this.toBirthdayScheduledAt(
          person.birthDate,
          nextYear,
          person.birthdayNotificationOffsetMinutes,
        ),
        dedupeKey,
      },
      update: {
        status: NotificationStatus.PENDING,
        scheduledAt: this.toBirthdayScheduledAt(
          person.birthDate,
          nextYear,
          person.birthdayNotificationOffsetMinutes,
        ),
        attemptCount: 0,
        sentAt: null,
        failedAt: null,
        lastAttemptAt: null,
        errorCode: null,
        errorMessage: null,
      },
    });
  }

  private toBirthdayNotificationBody(personName: string): string {
    return `오늘은 ${personName}님의 생일입니다.`;
  }

  private toBirthdayScheduledAt(
    birthDate: Date,
    year: number,
    offsetMinutes: number,
  ): Date {
    return new Date(
      Date.UTC(
        year,
        birthDate.getUTCMonth(),
        birthDate.getUTCDate(),
        BIRTHDAY_NOTIFICATION_HOUR_KST - KST_OFFSET_HOURS,
      ) -
        offsetMinutes * 60 * 1000,
    );
  }

  private toBirthdayNotificationDedupeKey(
    personId: string,
    year: number,
  ): string {
    return `birthday:${personId}:${year}`;
  }

  private toBirthdayNotificationYear(dedupeKey: string): number {
    const year = Number(dedupeKey.split(':').at(-1));

    return Number.isInteger(year) ? year : new Date().getFullYear();
  }
}
