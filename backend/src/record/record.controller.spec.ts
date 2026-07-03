import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { RequiredAgreementsGuard } from '../agreements/required-agreements.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateTextRecordDto } from './dto/create-text-record.dto';
import { UpdateTextRecordDto } from './dto/update-text-record.dto';
import { UpdateVoiceRecordDto } from './dto/update-voice-record.dto';
import { RecordController } from './record.controller';
import { RecordService } from './record.service';

describe('RecordController', () => {
  let recordService: {
    getRecords: jest.Mock;
    createTextRecord: jest.Mock;
    getTextRecord: jest.Mock;
    updateTextRecord: jest.Mock;
    getVoiceRecord: jest.Mock;
    updateVoiceRecord: jest.Mock;
    deleteRecord: jest.Mock;
  };
  let controller: RecordController;

  beforeEach(() => {
    recordService = {
      getRecords: jest.fn().mockResolvedValue([]),
      createTextRecord: jest.fn().mockResolvedValue({}),
      getTextRecord: jest.fn().mockResolvedValue({}),
      updateTextRecord: jest.fn().mockResolvedValue({}),
      getVoiceRecord: jest.fn().mockResolvedValue({}),
      updateVoiceRecord: jest.fn().mockResolvedValue({}),
      deleteRecord: jest.fn().mockResolvedValue({ success: true }),
    };
    controller = new RecordController(
      recordService as unknown as RecordService,
    );
  });

  it('registers GET /record behind auth and required agreements guards', async () => {
    const getRecordsHandler = Object.getOwnPropertyDescriptor(
      RecordController.prototype,
      'getRecords',
    )?.value as object;
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };

    await expect(controller.getRecords(currentUser)).resolves.toEqual([]);

    expect(Reflect.getMetadata(PATH_METADATA, RecordController)).toBe('record');
    expect(Reflect.getMetadata(PATH_METADATA, getRecordsHandler)).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, getRecordsHandler)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, getRecordsHandler)).toEqual([
      JwtAuthGuard,
      RequiredAgreementsGuard,
    ]);
    expect(recordService.getRecords).toHaveBeenCalledWith('user-1');
  });

  it('registers POST /record/text behind auth and required agreements guards', async () => {
    const createTextRecordHandler = Object.getOwnPropertyDescriptor(
      RecordController.prototype,
      'createTextRecord',
    )?.value as object;
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };
    const dto = plainToInstance(CreateTextRecordDto, {
      title: ' 미팅 기록 ',
      content: ' 회의 내용 ',
      peopleIds: ['person-1', 'person-2'],
    });

    await expect(
      controller.createTextRecord(currentUser, dto),
    ).resolves.toEqual({});

    expect(Reflect.getMetadata(PATH_METADATA, createTextRecordHandler)).toBe(
      'text',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, createTextRecordHandler)).toBe(
      RequestMethod.POST,
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, createTextRecordHandler),
    ).toEqual([JwtAuthGuard, RequiredAgreementsGuard]);
    expect(recordService.createTextRecord).toHaveBeenCalledWith('user-1', {
      title: '미팅 기록',
      content: '회의 내용',
      peopleIds: ['person-1', 'person-2'],
    });
  });

  it('registers GET /record/text/:recordId behind auth and required agreements guards', async () => {
    const getTextRecordHandler = Object.getOwnPropertyDescriptor(
      RecordController.prototype,
      'getTextRecord',
    )?.value as object;
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };

    await expect(
      controller.getTextRecord(currentUser, 'record-1'),
    ).resolves.toEqual({});

    expect(Reflect.getMetadata(PATH_METADATA, getTextRecordHandler)).toBe(
      'text/:recordId',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, getTextRecordHandler)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, getTextRecordHandler)).toEqual([
      JwtAuthGuard,
      RequiredAgreementsGuard,
    ]);
    expect(recordService.getTextRecord).toHaveBeenCalledWith(
      'user-1',
      'record-1',
    );
  });

  it('registers PATCH /record/text/:recordId behind auth and required agreements guards', async () => {
    const updateTextRecordHandler = Object.getOwnPropertyDescriptor(
      RecordController.prototype,
      'updateTextRecord',
    )?.value as object;
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };
    const dto = plainToInstance(UpdateTextRecordDto, {
      title: ' 미팅 기록 ',
      content: ' 회의 내용 ',
      personIds: ['person-1', 'person-2'],
    });

    await expect(
      controller.updateTextRecord(currentUser, 'record-1', dto),
    ).resolves.toEqual({});

    expect(Reflect.getMetadata(PATH_METADATA, updateTextRecordHandler)).toBe(
      'text/:recordId',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, updateTextRecordHandler)).toBe(
      RequestMethod.PATCH,
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, updateTextRecordHandler),
    ).toEqual([JwtAuthGuard, RequiredAgreementsGuard]);
    expect(recordService.updateTextRecord).toHaveBeenCalledWith(
      'user-1',
      'record-1',
      {
        title: '미팅 기록',
        content: '회의 내용',
        personIds: ['person-1', 'person-2'],
      },
    );
  });

  it('registers GET /record/voice/:recordId behind auth and required agreements guards', async () => {
    const getVoiceRecordHandler = Object.getOwnPropertyDescriptor(
      RecordController.prototype,
      'getVoiceRecord',
    )?.value as object;
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };

    await expect(
      controller.getVoiceRecord(currentUser, 'record-1'),
    ).resolves.toEqual({});

    expect(Reflect.getMetadata(PATH_METADATA, getVoiceRecordHandler)).toBe(
      'voice/:recordId',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, getVoiceRecordHandler)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, getVoiceRecordHandler)).toEqual(
      [JwtAuthGuard, RequiredAgreementsGuard],
    );
    expect(recordService.getVoiceRecord).toHaveBeenCalledWith(
      'user-1',
      'record-1',
    );
  });

  it('registers PATCH /record/voice/:recordId behind auth and required agreements guards', async () => {
    const updateVoiceRecordHandler = Object.getOwnPropertyDescriptor(
      RecordController.prototype,
      'updateVoiceRecord',
    )?.value as object;
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };
    const dto = plainToInstance(UpdateVoiceRecordDto, {
      title: ' 미팅 기록 ',
      recordMemo: ' 다시 볼 것 ',
      personIds: ['person-1', 'person-2'],
    });

    await expect(
      controller.updateVoiceRecord(currentUser, 'record-1', dto),
    ).resolves.toEqual({});

    expect(Reflect.getMetadata(PATH_METADATA, updateVoiceRecordHandler)).toBe(
      'voice/:recordId',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, updateVoiceRecordHandler)).toBe(
      RequestMethod.PATCH,
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, updateVoiceRecordHandler),
    ).toEqual([JwtAuthGuard, RequiredAgreementsGuard]);
    expect(recordService.updateVoiceRecord).toHaveBeenCalledWith(
      'user-1',
      'record-1',
      {
        title: '미팅 기록',
        recordMemo: '다시 볼 것',
        personIds: ['person-1', 'person-2'],
      },
    );
  });

  it('registers DELETE /record/:recordId behind auth and required agreements guards', async () => {
    const deleteRecordHandler = Object.getOwnPropertyDescriptor(
      RecordController.prototype,
      'deleteRecord',
    )?.value as object;
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };

    await expect(
      controller.deleteRecord(currentUser, 'record-1'),
    ).resolves.toEqual({ success: true });

    expect(Reflect.getMetadata(PATH_METADATA, deleteRecordHandler)).toBe(
      ':recordId',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, deleteRecordHandler)).toBe(
      RequestMethod.DELETE,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, deleteRecordHandler)).toEqual([
      JwtAuthGuard,
      RequiredAgreementsGuard,
    ]);
    expect(recordService.deleteRecord).toHaveBeenCalledWith(
      'user-1',
      'record-1',
    );
  });
});
