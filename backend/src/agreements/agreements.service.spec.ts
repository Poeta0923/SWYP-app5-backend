import { ConflictException } from '@nestjs/common';
import { AgreementAction, AgreementType } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AgreementsService } from './agreements.service';

describe('AgreementsService', () => {
  let prisma: {
    $transaction: jest.Mock;
    agreementDocument: {
      findMany: jest.Mock;
    };
    userAgreement: {
      findMany: jest.Mock;
      upsert: jest.Mock;
    };
    userAgreementEvent: {
      create: jest.Mock;
    };
  };
  let service: AgreementsService;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn().mockImplementation((callback) =>
        callback({
          userAgreement: prisma.userAgreement,
          userAgreementEvent: prisma.userAgreementEvent,
        }),
      ),
      agreementDocument: {
        findMany: jest.fn(),
      },
      userAgreement: {
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
      userAgreementEvent: {
        create: jest.fn(),
      },
    };
    service = new AgreementsService(prisma as unknown as PrismaService);
  });

  it('returns active agreements with only the latest document of each type', async () => {
    const newerTermsDocument = {
      id: 'terms-v2-id',
      type: AgreementType.TERMS,
      version: '0.0.2',
      title: '이용 약관 동의(필수)',
      content: '테스트용 이용약관',
      contentHash: 'content-hash',
      required: true,
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
      required: false,
    };
    prisma.agreementDocument.findMany.mockResolvedValue([
      marketingDocument,
      newerTermsDocument,
      olderTermsDocument,
    ]);

    await expect(service.getActiveAgreements()).resolves.toEqual([
      marketingDocument,
      newerTermsDocument,
    ]);
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
  });

  it('returns active agreement statuses for the latest document of each type', async () => {
    const newerTermsDocument = {
      id: 'terms-v2-id',
      type: AgreementType.TERMS,
      version: '0.0.2',
      title: '이용 약관 동의(필수)',
      content: '테스트용 이용약관',
      contentHash: 'content-hash',
      required: true,
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
      required: false,
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

  it('returns true when the user agreed to all active required agreements', async () => {
    const requiredDocument = {
      id: 'terms-id',
      type: AgreementType.TERMS,
      version: '0.0.1',
      title: '이용 약관 동의(필수)',
      content: '테스트용 이용약관',
      contentHash: 'content-hash',
      required: true,
      effectiveAt: new Date('2026-06-24T00:00:00.000Z'),
      retiredAt: null,
      createdAt: new Date('2026-06-24T00:00:00.000Z'),
      updatedAt: new Date('2026-06-24T00:00:00.000Z'),
    };
    const optionalDocument = {
      ...requiredDocument,
      id: 'marketing-email-id',
      type: AgreementType.MARKETING_EMAIL,
      title: 'E-mail 광고성 정보 수신동의(선택)',
      required: false,
    };
    prisma.agreementDocument.findMany.mockResolvedValue([
      optionalDocument,
      requiredDocument,
    ]);
    prisma.userAgreement.findMany.mockResolvedValue([
      {
        documentId: requiredDocument.id,
      },
    ]);

    await expect(
      service.hasAgreedAllRequiredAgreements('user-1'),
    ).resolves.toBe(true);
    expect(prisma.userAgreement.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        documentId: {
          in: [requiredDocument.id],
        },
        withdrawnAt: null,
      },
      select: {
        documentId: true,
      },
    });
  });

  it('returns false when the user has not agreed to every active required agreement', async () => {
    const termsDocument = {
      id: 'terms-id',
      type: AgreementType.TERMS,
      version: '0.0.1',
      title: '이용 약관 동의(필수)',
      content: '테스트용 이용약관',
      contentHash: 'content-hash',
      required: true,
      effectiveAt: new Date('2026-06-24T00:00:00.000Z'),
      retiredAt: null,
      createdAt: new Date('2026-06-24T00:00:00.000Z'),
      updatedAt: new Date('2026-06-24T00:00:00.000Z'),
    };
    const privacyDocument = {
      ...termsDocument,
      id: 'privacy-required-id',
      type: AgreementType.PRIVACY_REQUIRED,
      title: '개인정보 수집 및 이용동의(필수)',
    };
    prisma.agreementDocument.findMany.mockResolvedValue([
      privacyDocument,
      termsDocument,
    ]);
    prisma.userAgreement.findMany.mockResolvedValue([
      {
        documentId: termsDocument.id,
      },
    ]);

    await expect(
      service.hasAgreedAllRequiredAgreements('user-1'),
    ).resolves.toBe(false);
  });

  it('returns true when there are no active required agreements', async () => {
    prisma.agreementDocument.findMany.mockResolvedValue([
      {
        id: 'marketing-email-id',
        type: AgreementType.MARKETING_EMAIL,
        version: '0.0.1',
        title: 'E-mail 광고성 정보 수신동의(선택)',
        content: '테스트용 이용약관',
        contentHash: 'content-hash',
        required: false,
        effectiveAt: new Date('2026-06-24T00:00:00.000Z'),
        retiredAt: null,
        createdAt: new Date('2026-06-24T00:00:00.000Z'),
        updatedAt: new Date('2026-06-24T00:00:00.000Z'),
      },
    ]);

    await expect(
      service.hasAgreedAllRequiredAgreements('user-1'),
    ).resolves.toBe(true);

    expect(prisma.userAgreement.findMany).not.toHaveBeenCalled();
  });

  it('stores agreement consent events and returns updated active agreement statuses', async () => {
    const termsDocument = {
      id: 'terms-id',
      type: AgreementType.TERMS,
      version: '0.0.1',
      title: '이용 약관 동의(필수)',
      content: '테스트용 이용약관',
      contentHash: 'content-hash',
      required: true,
      effectiveAt: new Date('2026-06-24T00:00:00.000Z'),
      retiredAt: null,
      createdAt: new Date('2026-06-24T00:00:00.000Z'),
      updatedAt: new Date('2026-06-24T00:00:00.000Z'),
    };
    const marketingDocument = {
      ...termsDocument,
      id: 'marketing-email-id',
      type: AgreementType.MARKETING_EMAIL,
      title: 'E-mail 광고성 정보 수신동의(선택)',
      required: false,
    };
    prisma.agreementDocument.findMany.mockResolvedValue([
      marketingDocument,
      termsDocument,
    ]);
    prisma.userAgreement.upsert
      .mockResolvedValueOnce({ id: 'user-agreement-terms-id' })
      .mockResolvedValueOnce({ id: 'user-agreement-marketing-id' });
    prisma.userAgreement.findMany.mockResolvedValue([
      {
        documentId: termsDocument.id,
      },
      {
        documentId: marketingDocument.id,
      },
    ]);

    await expect(
      service.agreeAgreements({
        userId: 'user-1',
        agreementDocumentIds: [termsDocument.id, marketingDocument.id],
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      }),
    ).resolves.toEqual([
      {
        type: AgreementType.MARKETING_EMAIL,
        documentId: marketingDocument.id,
        version: marketingDocument.version,
        title: marketingDocument.title,
        required: false,
        agreed: true,
      },
      {
        type: AgreementType.TERMS,
        documentId: termsDocument.id,
        version: termsDocument.version,
        title: termsDocument.title,
        required: true,
        agreed: true,
      },
    ]);

    expect(prisma.userAgreement.upsert).toHaveBeenNthCalledWith(1, {
      where: {
        userId_documentId: {
          userId: 'user-1',
          documentId: termsDocument.id,
        },
      },
      update: {
        agreedAt: expect.any(Date),
        withdrawnAt: null,
      },
      create: {
        userId: 'user-1',
        documentId: termsDocument.id,
        agreedAt: expect.any(Date),
      },
    });
    expect(prisma.userAgreementEvent.create).toHaveBeenNthCalledWith(1, {
      data: {
        userId: 'user-1',
        agreementId: 'user-agreement-terms-id',
        documentId: termsDocument.id,
        action: AgreementAction.AGREED,
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
    });
    expect(prisma.userAgreement.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.userAgreementEvent.create).toHaveBeenCalledTimes(2);
  });

  it('rejects agreement consent for inactive or unknown documents', async () => {
    prisma.agreementDocument.findMany.mockResolvedValue([
      {
        id: 'terms-id',
        type: AgreementType.TERMS,
        version: '0.0.1',
        title: '이용 약관 동의(필수)',
        content: '테스트용 이용약관',
        contentHash: 'content-hash',
        required: true,
        effectiveAt: new Date('2026-06-24T00:00:00.000Z'),
        retiredAt: null,
        createdAt: new Date('2026-06-24T00:00:00.000Z'),
        updatedAt: new Date('2026-06-24T00:00:00.000Z'),
      },
    ]);

    const promise = service.agreeAgreements({
      userId: 'user-1',
      agreementDocumentIds: ['unknown-document-id'],
    });

    await expect(promise).rejects.toBeInstanceOf(ConflictException);
    await expect(promise).rejects.toMatchObject({
      response: {
        code: 'AGREEMENTS_CHANGED',
        message: '약관이 변경되었습니다. 다시 로그인해주세요.',
        invalidDocumentIds: ['unknown-document-id'],
      },
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.userAgreement.upsert).not.toHaveBeenCalled();
    expect(prisma.userAgreementEvent.create).not.toHaveBeenCalled();
  });
});
