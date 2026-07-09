import { Injectable, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  NotificationStatus,
  NotificationType,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PiiCryptoService } from '../privacy/pii-crypto.service';
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
    birthMonth: number | null;
    birthDay: number | null;
    birthdayNotificationOffsetMinutes: number;
  } | null;
};

type SentNotificationParams = {
  attemptedAt: Date;
  title: string;
  body: string;
  data: Record<string, string>;
  scheduleId?: string;
  personId?: string;
  result: {
    errorCode: string | null;
    errorMessage: string | null;
  };
};

@Injectable()
export class NotificationWorkerService {
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly fcmNotificationService: FcmNotificationService,
    @Optional()
    private readonly piiCryptoService: PiiCryptoService = new PiiCryptoService(),
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
              birthMonth: true,
              birthDay: true,
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

    const title = this.piiCryptoService.decrypt(job.schedule.title);
    const body = this.toScheduleNotificationBody(job.schedule.scheduleTime);
    const data = {
      type: NotificationType.SCHEDULE,
      scheduleId: job.schedule.id,
    };

    const result = await this.fcmNotificationService.sendScheduleNotification({
      userId: job.userId,
      scheduleId: job.schedule.id,
      title,
      body,
    });

    if (result.successCount > 0) {
      await this.markJobSentAndCreateNotification(job, {
        attemptedAt,
        title,
        body,
        data,
        scheduleId: job.schedule.id,
        result,
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

  private async markJobSentAndCreateNotification(
    job: Pick<DueNotificationJob, 'id' | 'userId' | 'type'>,
    params: SentNotificationParams,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.notification.create({
        data: {
          userId: job.userId,
          type: job.type,
          title: this.piiCryptoService.encrypt(params.title),
          body: this.piiCryptoService.encrypt(params.body),
          data: params.data,
          notificationJobId: job.id,
          scheduleId: params.scheduleId ?? null,
          personId: params.personId ?? null,
          sentAt: params.attemptedAt,
        },
      });

      await tx.notificationJob.update({
        where: {
          id: job.id,
        },
        data: {
          status: NotificationStatus.SENT,
          attemptCount: {
            increment: 1,
          },
          sentAt: params.attemptedAt,
          failedAt: null,
          lastAttemptAt: params.attemptedAt,
          errorCode: params.result.errorCode,
          errorMessage: params.result.errorMessage,
        },
      });
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

    if (!job.person || !job.person.birthMonth || !job.person.birthDay) {
      await this.markJobFailed(job, {
        attemptedAt,
        errorCode: 'PERSON_BIRTHDAY_NOT_FOUND',
        errorMessage: '알림을 보낼 생일 정보를 찾을 수 없습니다.',
      });
      return;
    }

    const personName = this.piiCryptoService.decrypt(job.person.name);
    const title = `${personName}님 생일`;
    const body = this.toBirthdayNotificationBody(personName);
    const data = {
      type: NotificationType.BIRTHDAY,
      personId: job.person.id,
    };

    const result = await this.fcmNotificationService.sendBirthdayNotification({
      userId: job.userId,
      personId: job.person.id,
      title,
      body,
    });

    if (result.successCount > 0) {
      await this.markJobSentAndCreateNotification(job, {
        attemptedAt,
        title,
        body,
        data,
        personId: job.person.id,
        result,
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
    if (!person.birthMonth || !person.birthDay) {
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
          person.birthMonth,
          person.birthDay,
          nextYear,
          person.birthdayNotificationOffsetMinutes,
        ),
        dedupeKey,
      },
      update: {
        status: NotificationStatus.PENDING,
        scheduledAt: this.toBirthdayScheduledAt(
          person.birthMonth,
          person.birthDay,
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
    birthMonth: number,
    birthDay: number,
    year: number,
    offsetMinutes: number,
  ): Date {
    return new Date(
      Date.UTC(
        year,
        birthMonth - 1,
        birthDay,
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
