import { Injectable } from '@nestjs/common';
import { Prisma, RecordType } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

const HOME_SCHEDULE_LIMIT = 5;
const HOME_PERSON_LIMIT = 3;
const HOME_RECORD_LIMIT = 5;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface HomeScheduleResponse {
  id: string;
  title: string;
  scheduleTime: string;
  dDay: string;
}

export interface HomeImportantPersonResponse {
  id: string;
  name: string;
  isImportant: boolean;
  job: string | null;
  company: string | null;
  position: string | null;
  relationship: string | null;
  image: string | null;
}

export interface HomeRecordResponse {
  id: string;
  type: string;
  title: string;
  people: string[];
  createdAt: string;
  voiceDuration: string | null;
}

export interface HomeResponse {
  schedules: HomeScheduleResponse[];
  people: HomeImportantPersonResponse[];
  records: HomeRecordResponse[];
}

type HomePersonProfileImageFile = {
  s3Key: string;
};

@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
  ) {}

  async getHome(userId: string): Promise<HomeResponse> {
    const now = new Date();

    const [schedules, people, records] = await Promise.all([
      this.getSchedules(userId, now),
      this.getImportantPeople(userId),
      this.getRecentRecords(userId),
    ]);

    return { schedules, people, records };
  }

  private async getSchedules(
    userId: string,
    now: Date,
  ): Promise<HomeScheduleResponse[]> {
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
      },
      orderBy: { scheduleTime: Prisma.SortOrder.asc },
      take: HOME_SCHEDULE_LIMIT,
    });

    return schedules.map((schedule) => ({
      id: schedule.id,
      title: schedule.title,
      scheduleTime: schedule.scheduleTime.toISOString(),
      dDay: this.toDDay(now, schedule.scheduleTime),
    }));
  }

  private async getImportantPeople(
    userId: string,
  ): Promise<HomeImportantPersonResponse[]> {
    const people = await this.prisma.person.findMany({
      where: {
        userId,
        isImportant: true,
      },
      select: {
        id: true,
        name: true,
        isImportant: true,
        job: true,
        company: true,
        position: true,
        relationship: true,
        profileImageFile: {
          select: {
            s3Key: true,
          },
        },
      },
      orderBy: { interactedAt: Prisma.SortOrder.desc },
      take: HOME_PERSON_LIMIT,
    });

    return people.map(({ profileImageFile, ...person }) => ({
      ...person,
      image: this.toSignedImageUrl(profileImageFile),
    }));
  }

  private async getRecentRecords(
    userId: string,
  ): Promise<HomeRecordResponse[]> {
    const records = await this.prisma.record.findMany({
      where: { userId },
      select: {
        id: true,
        type: true,
        title: true,
        createdAt: true,
        voiceDurationSeconds: true,
        people: {
          select: {
            person: {
              select: {
                name: true,
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
      orderBy: { createdAt: Prisma.SortOrder.desc },
      take: HOME_RECORD_LIMIT,
    });

    return records.map((record) => ({
      id: record.id,
      type: record.type,
      title: record.title,
      people: record.people.map(({ person }) => person.name),
      createdAt: record.createdAt.toISOString(),
      voiceDuration:
        record.type === RecordType.VOICE
          ? this.toMinuteSecond(record.voiceDurationSeconds)
          : null,
    }));
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

  private toMinuteSecond(seconds: number | null): string | null {
    if (seconds === null) {
      return null;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${this.padTimeUnit(minutes)}:${this.padTimeUnit(remainingSeconds)}`;
  }

  private padTimeUnit(value: number): string {
    return value.toString().padStart(2, '0');
  }

  private toSignedImageUrl(
    imageFile: HomePersonProfileImageFile | null | undefined,
  ): string | null {
    return imageFile ? this.s3Service.getSignedUrl(imageFile.s3Key) : null;
  }
}
