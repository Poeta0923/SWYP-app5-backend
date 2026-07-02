import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RequiredAgreementsGuard } from '../agreements/required-agreements.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RecordController } from './record.controller';
import { RecordService } from './record.service';

describe('RecordController', () => {
  let recordService: {
    getRecords: jest.Mock;
  };
  let controller: RecordController;

  beforeEach(() => {
    recordService = {
      getRecords: jest.fn().mockResolvedValue([]),
    };
    controller = new RecordController(recordService as unknown as RecordService);
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
});
