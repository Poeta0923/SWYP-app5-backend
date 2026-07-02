import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { RequiredAgreementsGuard } from '../agreements/required-agreements.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateVoiceRecordDto } from './dto/update-voice-record.dto';
import { RecordController } from './record.controller';
import { RecordService } from './record.service';

describe('RecordController', () => {
  let recordService: {
    getRecords: jest.Mock;
    updateVoiceRecord: jest.Mock;
  };
  let controller: RecordController;

  beforeEach(() => {
    recordService = {
      getRecords: jest.fn().mockResolvedValue([]),
      updateVoiceRecord: jest.fn().mockResolvedValue({}),
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
});
