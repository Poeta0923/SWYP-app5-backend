import { Injectable, NotFoundException } from '@nestjs/common';
import type { NotificationType, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface NotificationResponse {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Prisma.JsonValue | null;
  scheduleId: string | null;
  personId: string | null;
  sentAt: string;
  readAt: string | null;
  isRead: boolean;
}

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async getNotifications(userId: string): Promise<NotificationResponse[]> {
    const notifications = await this.prisma.notification.findMany({
      where: {
        userId,
      },
      select: this.notificationSelect(),
      orderBy: {
        sentAt: 'desc',
      },
    });

    return notifications.map((notification) =>
      this.toNotificationResponse(notification),
    );
  }

  async markNotificationAsRead(
    userId: string,
    notificationId: string,
  ): Promise<NotificationResponse> {
    const existingNotification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
      select: {
        id: true,
        readAt: true,
      },
    });

    if (!existingNotification) {
      throw new NotFoundException({
        code: 'NOTIFICATION_NOT_FOUND',
        message: '알림을 찾을 수 없습니다.',
        notificationId,
      });
    }

    const notification = await this.prisma.notification.update({
      where: {
        id: existingNotification.id,
      },
      data: {
        readAt: existingNotification.readAt ?? new Date(),
      },
      select: this.notificationSelect(),
    });

    return this.toNotificationResponse(notification);
  }

  private notificationSelect() {
    return {
      id: true,
      type: true,
      title: true,
      body: true,
      data: true,
      scheduleId: true,
      personId: true,
      sentAt: true,
      readAt: true,
    } satisfies Prisma.NotificationSelect;
  }

  private toNotificationResponse(notification: {
    id: string;
    type: NotificationType;
    title: string;
    body: string;
    data: Prisma.JsonValue | null;
    scheduleId: string | null;
    personId: string | null;
    sentAt: Date;
    readAt: Date | null;
  }): NotificationResponse {
    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      scheduleId: notification.scheduleId,
      personId: notification.personId,
      sentAt: notification.sentAt.toISOString(),
      readAt: notification.readAt?.toISOString() ?? null,
      isRead: notification.readAt !== null,
    };
  }
}
