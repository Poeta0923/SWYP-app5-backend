import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { AgreementType } from '../../generated/prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AgreementsController } from './agreements.controller';
import { AgreementsService } from './agreements.service';

describe('AgreementsController', () => {
  let agreementsService: {
    getActiveAgreement: jest.Mock;
  };
  let controller: AgreementsController;

  beforeEach(() => {
    agreementsService = {
      getActiveAgreement: jest.fn().mockResolvedValue({
        id: 'agreement-document-id',
      }),
    };
    controller = new AgreementsController(
      agreementsService as unknown as AgreementsService,
    );
  });

  it('registers GET /agreements/:type', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AgreementsController)).toBe(
      'agreements',
    );
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        AgreementsController.prototype.getActiveAgreement,
      ),
    ).toBe(':type');
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        AgreementsController.prototype.getActiveAgreement,
      ),
    ).toBe(RequestMethod.GET);
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        AgreementsController.prototype.getActiveAgreement,
      ),
    ).toEqual([JwtAuthGuard]);
  });

  it('returns the active agreement for the requested type from the service', async () => {
    await expect(
      controller.getActiveAgreement(AgreementType.PRIVACY_REQUIRED),
    ).resolves.toEqual({
      id: 'agreement-document-id',
    });

    expect(agreementsService.getActiveAgreement).toHaveBeenCalledWith(
      AgreementType.PRIVACY_REQUIRED,
    );
  });
});
