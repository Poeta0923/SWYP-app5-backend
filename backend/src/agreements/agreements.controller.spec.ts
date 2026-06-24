import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AgreementsController } from './agreements.controller';
import { AgreementsService } from './agreements.service';

describe('AgreementsController', () => {
  let agreementsService: {
    getActivePrivacyRequiredAgreement: jest.Mock;
  };
  let controller: AgreementsController;

  beforeEach(() => {
    agreementsService = {
      getActivePrivacyRequiredAgreement: jest.fn().mockResolvedValue({
        id: 'agreement-document-id',
      }),
    };
    controller = new AgreementsController(
      agreementsService as unknown as AgreementsService,
    );
  });

  it('registers GET /agreements/privacy-required', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AgreementsController)).toBe(
      'agreements',
    );
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        AgreementsController.prototype.getActivePrivacyRequiredAgreement,
      ),
    ).toBe('privacy-required');
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        AgreementsController.prototype.getActivePrivacyRequiredAgreement,
      ),
    ).toBe(RequestMethod.GET);
  });

  it('returns the active required privacy agreement from the service', async () => {
    await expect(
      controller.getActivePrivacyRequiredAgreement(),
    ).resolves.toEqual({
      id: 'agreement-document-id',
    });

    expect(
      agreementsService.getActivePrivacyRequiredAgreement,
    ).toHaveBeenCalledTimes(1);
  });
});
