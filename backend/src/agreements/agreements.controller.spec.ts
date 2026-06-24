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
    agreeAgreements: jest.Mock;
  };
  let controller: AgreementsController;

  beforeEach(() => {
    agreementsService = {
      getActiveAgreements: jest.fn().mockResolvedValue([
        {
          id: 'agreement-document-id',
        },
      ]),
      agreeAgreements: jest.fn().mockResolvedValue([
        {
          documentId: 'agreement-document-id',
          agreed: true,
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

  it('registers POST /agreements/consents behind JwtAuthGuard', () => {
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        AgreementsController.prototype.agreeAgreements,
      ),
    ).toBe('consents');
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        AgreementsController.prototype.agreeAgreements,
      ),
    ).toBe(RequestMethod.POST);
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        AgreementsController.prototype.agreeAgreements,
      ),
    ).toEqual([JwtAuthGuard]);
  });

  it('passes the authenticated user, document IDs, and request metadata to the service', async () => {
    await expect(
      controller.agreeAgreements(
        {
          sub: 'user-1',
          familyId: 'family-1',
          role: 'USER',
        },
        {
          agreementDocumentIds: ['agreement-document-id'],
        },
        {
          ip: '127.0.0.1',
          get: jest.fn().mockReturnValue('jest'),
        } as never,
      ),
    ).resolves.toEqual([
      {
        documentId: 'agreement-document-id',
        agreed: true,
      },
    ]);

    expect(agreementsService.agreeAgreements).toHaveBeenCalledWith({
      userId: 'user-1',
      agreementDocumentIds: ['agreement-document-id'],
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    });
  });
});
