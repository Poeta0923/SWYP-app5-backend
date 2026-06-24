import { NotFoundException } from '@nestjs/common';
import { AgreementType } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AgreementsService } from './agreements.service';

describe('AgreementsService', () => {
  let prisma: {
    agreementDocument: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
    userAgreement: {
      findMany: jest.Mock;
    };
  };
  let service: AgreementsService;

  beforeEach(() => {
    prisma = {
      agreementDocument: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      userAgreement: {
        findMany: jest.fn(),
      },
    };
    service = new AgreementsService(prisma as unknown as PrismaService);
  });

  it('returns the latest active document for the requested type effective at or before now', async () => {
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

    await expect(
      service.getActiveAgreement(AgreementType.PRIVACY_REQUIRED),
    ).resolves.toEqual(document);

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

  it('throws NotFoundException when there is no active document for the requested type', async () => {
    prisma.agreementDocument.findFirst.mockResolvedValue(null);

    await expect(
      service.getActiveAgreement(AgreementType.PRIVACY_REQUIRED),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns active agreement statuses for the latest document of each type', async () => {
    const newerTermsDocument = {
      id: 'terms-v2-id',
      type: AgreementType.TERMS,
      version: '0.0.2',
      title: '이용 약관 동의(필수)',
      content: '테스트용 이용약관',
      contentHash: 'content-hash',
      effectiveAt: new Date('2026-06-24T00:00:00.000Z'),
      retiredAt: null,
      createdAt: new Date('2026-06-24T00:00:00.000Z'),
      updatedAt: new Date('2026-06-24T00:00:00.000Z'),
    };
    const olderTermsDocument = {
      ...newerTermsDocument,
      id: 'terms-v1-id',
      version: '0.0.1',
      effectiveAt: new Date('2026-06-23T00:00:00.000Z'),
    };
    const marketingDocument = {
      ...newerTermsDocument,
      id: 'marketing-email-id',
      type: AgreementType.MARKETING_EMAIL,
      title: 'E-mail 광고성 정보 수신동의(선택)',
    };
    prisma.agreementDocument.findMany.mockResolvedValue([
      marketingDocument,
      newerTermsDocument,
      olderTermsDocument,
    ]);
    prisma.userAgreement.findMany.mockResolvedValue([
      {
        documentId: newerTermsDocument.id,
      },
    ]);

    await expect(service.getActiveAgreementStatuses('user-1')).resolves.toEqual(
      [
        {
          type: AgreementType.MARKETING_EMAIL,
          documentId: marketingDocument.id,
          version: marketingDocument.version,
          title: marketingDocument.title,
          required: false,
          agreed: false,
        },
        {
          type: AgreementType.TERMS,
          documentId: newerTermsDocument.id,
          version: newerTermsDocument.version,
          title: newerTermsDocument.title,
          required: true,
          agreed: true,
        },
      ],
    );
    expect(prisma.agreementDocument.findMany).toHaveBeenCalledWith({
      where: {
        retiredAt: null,
        effectiveAt: {
          lte: expect.any(Date),
        },
      },
      orderBy: [
        {
          type: 'asc',
        },
        {
          effectiveAt: 'desc',
        },
      ],
    });
    expect(prisma.userAgreement.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        documentId: {
          in: [marketingDocument.id, newerTermsDocument.id],
        },
        withdrawnAt: null,
      },
      select: {
        documentId: true,
      },
    });
  });

  it('returns an empty agreement status list when there are no active documents', async () => {
    prisma.agreementDocument.findMany.mockResolvedValue([]);

    await expect(service.getActiveAgreementStatuses('user-1')).resolves.toEqual(
      [],
    );

    expect(prisma.userAgreement.findMany).not.toHaveBeenCalled();
  });
});
