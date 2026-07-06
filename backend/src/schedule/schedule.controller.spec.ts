import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RequiredAgreementsGuard } from '../agreements/required-agreements.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';

describe('ScheduleController', () => {
  let scheduleService: {
    createSchedule: jest.Mock;
    getSchedules: jest.Mock;
    getScheduleDetail: jest.Mock;
    updateSchedule: jest.Mock;
  };
  let controller: ScheduleController;

  beforeEach(() => {
    scheduleService = {
      createSchedule: jest.fn().mockResolvedValue({
        id: 'schedule-1',
        title: '오늘 미팅',
        scheduleTime: '2026-06-29T08:00:00.000Z',
        people: [],
        content: null,
        notificationEnabled: true,
        reminderOffsetMinutes: 60,
      }),
      getSchedules: jest.fn().mockResolvedValue([]),
      getScheduleDetail: jest.fn().mockResolvedValue({
        id: 'schedule-1',
        title: '오늘 미팅',
        scheduleTime: '2026-06-29T08:00:00.000Z',
        people: [],
        content: null,
        notificationEnabled: true,
        reminderOffsetMinutes: 60,
      }),
      updateSchedule: jest.fn().mockResolvedValue({
        id: 'schedule-1',
        title: '수정된 미팅',
        scheduleTime: '2026-06-30T08:00:00.000Z',
        people: [],
        content: null,
        notificationEnabled: false,
        reminderOffsetMinutes: 0,
      }),
    };
    controller = new ScheduleController(
      scheduleService as unknown as ScheduleService,
    );
  });

  it('registers GET /schedule behind auth and required agreements guards', async () => {
    const getSchedulesHandler = Object.getOwnPropertyDescriptor(
      ScheduleController.prototype,
      'getSchedules',
    )?.value as object;
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };

    await expect(controller.getSchedules(currentUser)).resolves.toEqual([]);

    expect(Reflect.getMetadata(PATH_METADATA, ScheduleController)).toBe(
      'schedule',
    );
    expect(Reflect.getMetadata(PATH_METADATA, getSchedulesHandler)).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, getSchedulesHandler)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, getSchedulesHandler)).toEqual([
      JwtAuthGuard,
      RequiredAgreementsGuard,
    ]);
    expect(scheduleService.getSchedules).toHaveBeenCalledWith('user-1');
  });

  it('registers POST /schedule behind auth and required agreements guards', async () => {
    const createScheduleHandler = Object.getOwnPropertyDescriptor(
      ScheduleController.prototype,
      'createSchedule',
    )?.value as object;
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };
    const dto = {
      title: '오늘 미팅',
      scheduleTime: '2026-06-29T08:00:00.000Z',
      personIds: ['person-1'],
      notificationEnabled: true,
      reminderOffsetMinutes: 60,
      content: null,
      recordId: null,
    };

    await expect(controller.createSchedule(currentUser, dto)).resolves.toEqual({
      id: 'schedule-1',
      title: '오늘 미팅',
      scheduleTime: '2026-06-29T08:00:00.000Z',
      people: [],
      content: null,
      notificationEnabled: true,
      reminderOffsetMinutes: 60,
    });

    expect(Reflect.getMetadata(PATH_METADATA, createScheduleHandler)).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, createScheduleHandler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, createScheduleHandler)).toEqual(
      [JwtAuthGuard, RequiredAgreementsGuard],
    );
    expect(scheduleService.createSchedule).toHaveBeenCalledWith('user-1', dto);
  });

  it('registers GET /schedule/:scheduleId behind auth and required agreements guards', async () => {
    const getScheduleDetailHandler = Object.getOwnPropertyDescriptor(
      ScheduleController.prototype,
      'getScheduleDetail',
    )?.value as object;
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };

    await expect(
      controller.getScheduleDetail(currentUser, 'schedule-1'),
    ).resolves.toEqual({
      id: 'schedule-1',
      title: '오늘 미팅',
      scheduleTime: '2026-06-29T08:00:00.000Z',
      people: [],
      content: null,
      notificationEnabled: true,
      reminderOffsetMinutes: 60,
    });

    expect(Reflect.getMetadata(PATH_METADATA, getScheduleDetailHandler)).toBe(
      ':scheduleId',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, getScheduleDetailHandler)).toBe(
      RequestMethod.GET,
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, getScheduleDetailHandler),
    ).toEqual([JwtAuthGuard, RequiredAgreementsGuard]);
    expect(scheduleService.getScheduleDetail).toHaveBeenCalledWith(
      'user-1',
      'schedule-1',
    );
  });

  it('registers PATCH /schedule/:scheduleId behind auth and required agreements guards', async () => {
    const updateScheduleHandler = Object.getOwnPropertyDescriptor(
      ScheduleController.prototype,
      'updateSchedule',
    )?.value as object;
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };
    const dto = {
      title: '수정된 미팅',
      notificationEnabled: false,
    };

    await expect(
      controller.updateSchedule(currentUser, 'schedule-1', dto),
    ).resolves.toEqual({
      id: 'schedule-1',
      title: '수정된 미팅',
      scheduleTime: '2026-06-30T08:00:00.000Z',
      people: [],
      content: null,
      notificationEnabled: false,
      reminderOffsetMinutes: 0,
    });

    expect(Reflect.getMetadata(PATH_METADATA, updateScheduleHandler)).toBe(
      ':scheduleId',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, updateScheduleHandler)).toBe(
      RequestMethod.PATCH,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, updateScheduleHandler)).toEqual(
      [JwtAuthGuard, RequiredAgreementsGuard],
    );
    expect(scheduleService.updateSchedule).toHaveBeenCalledWith(
      'user-1',
      'schedule-1',
      dto,
    );
  });
});
