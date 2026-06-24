import { NotFoundException } from '@nestjs/common';
import { AgreementType } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AgreementsService } from './agreements.service';

describe('AgreementsService', () => {
  let prisma: {
    agreementDocument: {
      findFirst: jest.Mock;
    };
  };
  let service: AgreementsService;

  beforeEach(() => {
    prisma = {
      agreementDocument: {
        findFirst: jest.fn(),
      },
    };
    service = new AgreementsService(prisma as unknown as PrismaService);
  });

  it('returns the latest active PRIVACY_REQUIRED document effective at or before now', async () => {
    const effectiveAt = new Date('2026-06-24T00:00:00.000Z');
    const document = {
      id: 'agreement-document-id',
      type: AgreementType.PRIVACY_REQUIRED,
      version: '2026.06.24',
      title: '개인정보 처리방침',
      content: '개인정보 처리방침 본문',
      contentHash: 'content-hash',
      effectiveAt,
      retiredAt: null,
      createdAt: new Date('2026-06-24T00:00:00.000Z'),
      updatedAt: new Date('2026-06-24T00:00:00.000Z'),
    };
    prisma.agreementDocument.findFirst.mockResolvedValue(document);

    await expect(service.getActivePrivacyRequiredAgreement()).resolves.toEqual(
      document,
    );

    expect(prisma.agreementDocument.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.agreementDocument.findFirst).toHaveBeenCalledWith({
      where: {
        type: AgreementType.PRIVACY_REQUIRED,
        retiredAt: null,
        effectiveAt: {
          lte: expect.any(Date),
        },
      },
      orderBy: {
        effectiveAt: 'desc',
      },
    });
  });

  it('throws NotFoundException when there is no active PRIVACY_REQUIRED document', async () => {
    prisma.agreementDocument.findFirst.mockResolvedValue(null);

    await expect(
      service.getActivePrivacyRequiredAgreement(),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
