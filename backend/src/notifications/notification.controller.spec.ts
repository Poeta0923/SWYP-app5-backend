import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RequiredAgreementsGuard } from '../agreements/required-agreements.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

describe('NotificationController', () => {
  let notificationService: {
    getNotifications: jest.Mock;
    markNotificationAsRead: jest.Mock;
  };
  let controller: NotificationController;

  beforeEach(() => {
    notificationService = {
      getNotifications: jest.fn().mockResolvedValue([
        {
          id: 'notification-1',
          type: 'SCHEDULE',
          title: '오늘 미팅',
          body: '일정이 예정되어 있습니다.',
          data: {
            type: 'SCHEDULE',
            scheduleId: 'schedule-1',
          },
          scheduleId: 'schedule-1',
          personId: null,
          sentAt: '2026-07-05T11:00:00.000Z',
          readAt: null,
          isRead: false,
        },
      ]),
      markNotificationAsRead: jest.fn().mockResolvedValue({
        id: 'notification-1',
        type: 'SCHEDULE',
        title: '오늘 미팅',
        body: '일정이 예정되어 있습니다.',
        data: {
          type: 'SCHEDULE',
          scheduleId: 'schedule-1',
        },
        scheduleId: 'schedule-1',
        personId: null,
        sentAt: '2026-07-05T11:00:00.000Z',
        readAt: '2026-07-05T12:00:00.000Z',
        isRead: true,
      }),
    };
    controller = new NotificationController(
      notificationService as unknown as NotificationService,
    );
  });

  it('registers GET /notifications behind auth and required agreements guards', async () => {
    const getNotificationsHandler = Object.getOwnPropertyDescriptor(
      NotificationController.prototype,
      'getNotifications',
    )?.value as object;
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };

    await expect(controller.getNotifications(currentUser)).resolves.toEqual([
      {
        id: 'notification-1',
        type: 'SCHEDULE',
        title: '오늘 미팅',
        body: '일정이 예정되어 있습니다.',
        data: {
          type: 'SCHEDULE',
          scheduleId: 'schedule-1',
        },
        scheduleId: 'schedule-1',
        personId: null,
        sentAt: '2026-07-05T11:00:00.000Z',
        readAt: null,
        isRead: false,
      },
    ]);

    expect(Reflect.getMetadata(PATH_METADATA, NotificationController)).toBe(
      'notifications',
    );
    expect(Reflect.getMetadata(PATH_METADATA, getNotificationsHandler)).toBe(
      '/',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, getNotificationsHandler)).toBe(
      RequestMethod.GET,
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, getNotificationsHandler),
    ).toEqual([JwtAuthGuard, RequiredAgreementsGuard]);
    expect(notificationService.getNotifications).toHaveBeenCalledWith('user-1');
  });

  it('registers PATCH /notifications/:notificationId/read behind auth and required agreements guards', async () => {
    const markNotificationAsReadHandler = Object.getOwnPropertyDescriptor(
      NotificationController.prototype,
      'markNotificationAsRead',
    )?.value as object;
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };

    await expect(
      controller.markNotificationAsRead(currentUser, 'notification-1'),
    ).resolves.toEqual({
      id: 'notification-1',
      type: 'SCHEDULE',
      title: '오늘 미팅',
      body: '일정이 예정되어 있습니다.',
      data: {
        type: 'SCHEDULE',
        scheduleId: 'schedule-1',
      },
      scheduleId: 'schedule-1',
      personId: null,
      sentAt: '2026-07-05T11:00:00.000Z',
      readAt: '2026-07-05T12:00:00.000Z',
      isRead: true,
    });

    expect(
      Reflect.getMetadata(PATH_METADATA, markNotificationAsReadHandler),
    ).toBe(':notificationId/read');
    expect(
      Reflect.getMetadata(METHOD_METADATA, markNotificationAsReadHandler),
    ).toBe(RequestMethod.PATCH);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, markNotificationAsReadHandler),
    ).toEqual([JwtAuthGuard, RequiredAgreementsGuard]);
    expect(notificationService.markNotificationAsRead).toHaveBeenCalledWith(
      'user-1',
      'notification-1',
    );
  });
});
