import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AgreementsController } from './agreements.controller';
import { AgreementsService } from './agreements.service';

describe('AgreementsController', () => {
  let agreementsService: {
    getActiveAgreements: jest.Mock;
  };
  let controller: AgreementsController;

  beforeEach(() => {
    agreementsService = {
      getActiveAgreements: jest.fn().mockResolvedValue([
        {
          id: 'agreement-document-id',
        },
      ]),
    };
    controller = new AgreementsController(
      agreementsService as unknown as AgreementsService,
    );
  });

  it('registers GET /agreements behind JwtAuthGuard', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AgreementsController)).toBe(
      'agreements',
    );
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        AgreementsController.prototype.getActiveAgreements,
      ),
    ).toBe('/');
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        AgreementsController.prototype.getActiveAgreements,
      ),
    ).toBe(RequestMethod.GET);
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        AgreementsController.prototype.getActiveAgreements,
      ),
    ).toEqual([JwtAuthGuard]);
  });

  it('returns active agreements from the service', async () => {
    await expect(controller.getActiveAgreements()).resolves.toEqual([
      {
        id: 'agreement-document-id',
      },
    ]);

    expect(agreementsService.getActiveAgreements).toHaveBeenCalledTimes(1);
  });
});
