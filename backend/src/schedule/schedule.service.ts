import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationStatus,
  NotificationType,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import type { CreateScheduleDto } from './dto/create-schedule.dto';
import type { UpdateScheduleDto } from './dto/update-schedule.dto';

const MILLISECONDS_PER_MINUTE = 60 * 1000;
const MILLISECONDS_PER_DAY = 24 * 60 * MILLISECONDS_PER_MINUTE;

export interface SchedulePersonResponse {
  id: string;
  name: string;
  image: string | null;
}

export interface ScheduleListItemResponse {
  id: string;
  title: string;
  people: SchedulePersonResponse[];
  scheduleTime: string;
  bookMark: boolean;
  dDay: string;
  reminderOffsetMinutes: number;
}

export interface ScheduleDetailResponse {
  id: string;
  title: string;
  scheduleTime: string;
  people: SchedulePersonResponse[];
  content: string | null;
  bookMark: boolean;
  notificationEnabled: boolean;
  reminderOffsetMinutes: number;
}

export interface DeleteScheduleResult {
  success: true;
}

type ScheduleProfileImageFile = {
  s3Key: string;
};

@Injectable()
export class ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
  ) {}

  async createSchedule(
    userId: string,
    item: CreateScheduleDto,
  ): Promise<ScheduleDetailResponse> {
    await this.assertPeopleExist(userId, item.personIds);
    await this.assertRecordCanBeLinked(userId, item.recordId ?? null);

    const scheduleTime = new Date(item.scheduleTime);
    const createdSchedule = await this.prisma.$transaction(async (tx) => {
      const schedule = await tx.schedule.create({
        data: {
          userId,
          title: item.title,
          content: item.content ?? null,
          scheduleTime,
          notificationEnabled: item.notificationEnabled,
          reminderOffsetMinutes: item.reminderOffsetMinutes,
        },
        select: {
          id: true,
        },
      });

      if (item.personIds.length > 0) {
        await tx.schedulePerson.createMany({
          data: item.personIds.map((personId) => ({
            userId,
            scheduleId: schedule.id,
            personId,
          })),
          skipDuplicates: true,
        });
      }

      if (item.recordId) {
        await tx.record.update({
          where: {
            id_userId: {
              id: item.recordId,
              userId,
            },
          },
          data: {
            scheduleId: schedule.id,
          },
        });
      }

      if (item.notificationEnabled) {
        await tx.notificationJob.create({
          data: {
            userId,
            type: NotificationType.SCHEDULE,
            scheduleId: schedule.id,
            scheduledAt: this.toScheduledAt(
              scheduleTime,
              item.reminderOffsetMinutes,
            ),
            dedupeKey: this.toScheduleNotificationDedupeKey(schedule.id),
          },
        });
      }

      return tx.schedule.findFirst({
        where: {
          id: schedule.id,
          userId,
        },
        select: this.scheduleDetailSelect(),
      });
    });

    if (!createdSchedule) {
      throw new NotFoundException({
        code: 'SCHEDULE_NOT_FOUND',
        message: '생성된 일정을 찾을 수 없습니다.',
      });
    }

    return this.toScheduleDetailResponse(createdSchedule);
  }

  async getSchedules(userId: string): Promise<ScheduleListItemResponse[]> {
    const now = new Date();
    const schedules = await this.prisma.schedule.findMany({
      where: {
        userId,
        scheduleTime: {
          gte: now,
        },
      },
      select: {
        id: true,
        title: true,
        scheduleTime: true,
        bookMark: true,
        reminderOffsetMinutes: true,
        people: {
          select: {
            person: {
              select: {
                id: true,
                name: true,
                profileImageFile: {
                  select: {
                    s3Key: true,
                  },
                },
              },
            },
          },
          orderBy: {
            person: {
              name: Prisma.SortOrder.asc,
            },
          },
        },
      },
      orderBy: [
        { bookMark: Prisma.SortOrder.desc },
        { scheduleTime: Prisma.SortOrder.asc },
      ],
    });

    return schedules.map((schedule) => ({
      id: schedule.id,
      title: schedule.title,
      people: schedule.people.map(({ person }) =>
        this.toSchedulePersonResponse(person),
      ),
      scheduleTime: schedule.scheduleTime.toISOString(),
      bookMark: schedule.bookMark,
      dDay: this.toDDay(now, schedule.scheduleTime),
      reminderOffsetMinutes: schedule.reminderOffsetMinutes,
    }));
  }

  async getScheduleDetail(
    userId: string,
    scheduleId: string,
  ): Promise<ScheduleDetailResponse> {
    const schedule = await this.prisma.schedule.findFirst({
      where: {
        id: scheduleId,
        userId,
      },
      select: {
        ...this.scheduleDetailSelect(),
      },
    });

    if (!schedule) {
      throw new NotFoundException({
        code: 'SCHEDULE_NOT_FOUND',
        message: '일정을 찾을 수 없습니다.',
        scheduleId,
      });
    }

    return this.toScheduleDetailResponse(schedule);
  }

  async updateSchedule(
    userId: string,
    scheduleId: string,
    item: UpdateScheduleDto,
  ): Promise<ScheduleDetailResponse> {
    if (
      !this.hasOwn(item, 'title') &&
      !this.hasOwn(item, 'scheduleTime') &&
      !this.hasOwn(item, 'personIds') &&
      !this.hasOwn(item, 'content') &&
      !this.hasOwn(item, 'bookMark') &&
      !this.hasOwn(item, 'notificationEnabled') &&
      !this.hasOwn(item, 'reminderOffsetMinutes')
    ) {
      throw new BadRequestException({
        code: 'SCHEDULE_UPDATE_EMPTY',
        message: '수정할 필드를 하나 이상 입력해 주세요.',
      });
    }

    const existingSchedule = await this.prisma.schedule.findFirst({
      where: {
        id: scheduleId,
        userId,
      },
      select: {
        id: true,
      },
    });

    if (!existingSchedule) {
      throw new NotFoundException({
        code: 'SCHEDULE_NOT_FOUND',
        message: '수정할 일정을 찾을 수 없습니다.',
        scheduleId,
      });
    }

    if (this.hasOwn(item, 'personIds')) {
      await this.assertPeopleExist(userId, item.personIds ?? []);
    }

    const updatedSchedule = await this.prisma.$transaction(async (tx) => {
      const scheduleUpdateData: Prisma.ScheduleUpdateInput = {
        updatedAt: new Date(),
      };

      if (this.hasOwn(item, 'title')) {
        scheduleUpdateData.title = item.title;
      }

      if (this.hasOwn(item, 'scheduleTime')) {
        scheduleUpdateData.scheduleTime = new Date(item.scheduleTime as string);
      }

      if (this.hasOwn(item, 'content')) {
        scheduleUpdateData.content = item.content ?? null;
      }

      if (this.hasOwn(item, 'bookMark')) {
        scheduleUpdateData.bookMark = item.bookMark;
      }

      if (this.hasOwn(item, 'notificationEnabled')) {
        scheduleUpdateData.notificationEnabled = item.notificationEnabled;
      }

      if (this.hasOwn(item, 'reminderOffsetMinutes')) {
        scheduleUpdateData.reminderOffsetMinutes = item.reminderOffsetMinutes;
      }

      await tx.schedule.update({
        where: {
          id_userId: {
            id: scheduleId,
            userId,
          },
        },
        data: scheduleUpdateData,
      });

      if (this.hasOwn(item, 'personIds')) {
        await tx.schedulePerson.deleteMany({
          where: {
            scheduleId,
            userId,
          },
        });

        if (item.personIds && item.personIds.length > 0) {
          await tx.schedulePerson.createMany({
            data: item.personIds.map((personId) => ({
              userId,
              scheduleId,
              personId,
            })),
            skipDuplicates: true,
          });
        }
      }

      const schedule = await tx.schedule.findFirst({
        where: {
          id: scheduleId,
          userId,
        },
        select: this.scheduleDetailSelect(),
      });

      if (!schedule) {
        return null;
      }

      await this.syncScheduleNotificationJob(tx, userId, schedule);

      return schedule;
    });

    if (!updatedSchedule) {
      throw new NotFoundException({
        code: 'SCHEDULE_NOT_FOUND',
        message: '수정된 일정을 찾을 수 없습니다.',
        scheduleId,
      });
    }

    return this.toScheduleDetailResponse(updatedSchedule);
  }

  async deleteSchedule(
    userId: string,
    scheduleId: string,
  ): Promise<DeleteScheduleResult> {
    const existingSchedule = await this.prisma.schedule.findFirst({
      where: {
        id: scheduleId,
        userId,
      },
      select: {
        id: true,
      },
    });

    if (!existingSchedule) {
      throw new NotFoundException({
        code: 'SCHEDULE_NOT_FOUND',
        message: '삭제할 일정을 찾을 수 없습니다.',
        scheduleId,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.notificationJob.deleteMany({
        where: {
          userId,
          scheduleId,
        },
      });

      await tx.schedulePerson.deleteMany({
        where: {
          userId,
          scheduleId,
        },
      });

      await tx.record.updateMany({
        where: {
          userId,
          scheduleId,
        },
        data: {
          scheduleId: null,
        },
      });

      const deleteResult = await tx.schedule.deleteMany({
        where: {
          id: scheduleId,
          userId,
        },
      });

      if (deleteResult.count !== 1) {
        throw new NotFoundException({
          code: 'SCHEDULE_NOT_FOUND',
          message: '삭제할 일정을 찾을 수 없습니다.',
          scheduleId,
        });
      }
    });

    return {
      success: true,
    };
  }

  private toScheduleDetailResponse(schedule: {
    id: string;
    title: string;
    scheduleTime: Date;
    people: {
      person: {
        id: string;
        name: string;
        profileImageFile: ScheduleProfileImageFile | null;
      };
    }[];
    content: string | null;
    bookMark: boolean;
    notificationEnabled: boolean;
    reminderOffsetMinutes: number;
  }): ScheduleDetailResponse {
    return {
      id: schedule.id,
      title: schedule.title,
      scheduleTime: schedule.scheduleTime.toISOString(),
      people: schedule.people.map(({ person }) =>
        this.toSchedulePersonResponse(person),
      ),
      content: schedule.content,
      bookMark: schedule.bookMark,
      notificationEnabled: schedule.notificationEnabled,
      reminderOffsetMinutes: schedule.reminderOffsetMinutes,
    };
  }

  private scheduleDetailSelect() {
    return {
      id: true,
      title: true,
      scheduleTime: true,
      content: true,
      bookMark: true,
      notificationEnabled: true,
      reminderOffsetMinutes: true,
      people: {
        select: {
          person: {
            select: {
              id: true,
              name: true,
              profileImageFile: {
                select: {
                  s3Key: true,
                },
              },
            },
          },
        },
        orderBy: {
          person: {
            name: Prisma.SortOrder.asc,
          },
        },
      },
    } satisfies Prisma.ScheduleSelect;
  }

  private async assertPeopleExist(
    userId: string,
    personIds: string[],
  ): Promise<void> {
    if (personIds.length === 0) {
      return;
    }

    const people = await this.prisma.person.findMany({
      where: {
        id: {
          in: personIds,
        },
        userId,
      },
      select: {
        id: true,
      },
    });

    if (people.length === personIds.length) {
      return;
    }

    const existingPersonIds = new Set(people.map((person) => person.id));
    const missingPersonIds = personIds.filter(
      (personId) => !existingPersonIds.has(personId),
    );

    throw new BadRequestException({
      code: 'SCHEDULE_PERSON_NOT_FOUND',
      message: '일정에 연결할 인물을 찾을 수 없습니다.',
      personIds: missingPersonIds,
    });
  }

  private async assertRecordCanBeLinked(
    userId: string,
    recordId: string | null,
  ): Promise<void> {
    if (!recordId) {
      return;
    }

    const record = await this.prisma.record.findFirst({
      where: {
        id: recordId,
        userId,
      },
      select: {
        id: true,
        scheduleId: true,
      },
    });

    if (!record) {
      throw new BadRequestException({
        code: 'SCHEDULE_RECORD_NOT_FOUND',
        message: '일정에 연결할 기록을 찾을 수 없습니다.',
        recordId,
      });
    }

    if (record.scheduleId) {
      throw new BadRequestException({
        code: 'SCHEDULE_RECORD_ALREADY_LINKED',
        message: '이미 일정에 연결된 기록입니다.',
        recordId,
        scheduleId: record.scheduleId,
      });
    }
  }

  private toScheduledAt(
    scheduleTime: Date,
    reminderOffsetMinutes: number,
  ): Date {
    return new Date(
      scheduleTime.getTime() - reminderOffsetMinutes * MILLISECONDS_PER_MINUTE,
    );
  }

  private toScheduleNotificationDedupeKey(scheduleId: string): string {
    return `schedule:${scheduleId}`;
  }

  private async syncScheduleNotificationJob(
    client: Pick<Prisma.TransactionClient, 'notificationJob'>,
    userId: string,
    schedule: {
      id: string;
      scheduleTime: Date;
      notificationEnabled: boolean;
      reminderOffsetMinutes: number;
    },
  ): Promise<void> {
    const dedupeKey = this.toScheduleNotificationDedupeKey(schedule.id);

    if (!schedule.notificationEnabled) {
      await client.notificationJob.updateMany({
        where: {
          userId,
          dedupeKey,
          status: NotificationStatus.PENDING,
        },
        data: {
          status: NotificationStatus.CANCELED,
        },
      });
      return;
    }

    await client.notificationJob.upsert({
      where: {
        userId_dedupeKey: {
          userId,
          dedupeKey,
        },
      },
      create: {
        userId,
        type: NotificationType.SCHEDULE,
        scheduleId: schedule.id,
        scheduledAt: this.toScheduledAt(
          schedule.scheduleTime,
          schedule.reminderOffsetMinutes,
        ),
        dedupeKey,
      },
      update: {
        status: NotificationStatus.PENDING,
        scheduledAt: this.toScheduledAt(
          schedule.scheduleTime,
          schedule.reminderOffsetMinutes,
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

  private hasOwn<T extends object, K extends PropertyKey>(
    object: T,
    key: K,
  ): object is T & Record<K, unknown> {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  private toSchedulePersonResponse(person: {
    id: string;
    name: string;
    profileImageFile: ScheduleProfileImageFile | null;
  }): SchedulePersonResponse {
    return {
      id: person.id,
      name: person.name,
      image: this.toSignedImageUrl(person.profileImageFile),
    };
  }

  private toDDay(now: Date, scheduleTime: Date): string {
    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const scheduleDate = new Date(
      scheduleTime.getFullYear(),
      scheduleTime.getMonth(),
      scheduleTime.getDate(),
    );
    const daysLeft = Math.max(
      0,
      Math.floor(
        (scheduleDate.getTime() - nowDate.getTime()) / MILLISECONDS_PER_DAY,
      ),
    );

    return `D-${daysLeft}`;
  }

  private toSignedImageUrl(
    imageFile: ScheduleProfileImageFile | null | undefined,
  ): string | null {
    return imageFile ? this.s3Service.getSignedUrl(imageFile.s3Key) : null;
  }
}
