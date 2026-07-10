import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type {
  AgreementDocument,
  AgreementType,
} from '../../generated/prisma/client';
import { AgreementAction } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AgreementDocumentResponse = AgreementDocument & {
  agreed: boolean;
};

export interface AgreementStatusResponse {
  type: AgreementType;
  documentId: string;
  version: string;
  title: string;
  required: boolean;
  agreed: boolean;
}

export interface AgreeAgreementsParams {
  userId: string;
  agreementDocumentIds: string[];
  ipAddress?: string;
  userAgent?: string;
}

export interface UpdateAgreementConsentParams {
  userId: string;
  agreementDocumentId: string;
  agreed: boolean;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AgreementsService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveAgreements(
    userId: string,
  ): Promise<AgreementDocumentResponse[]> {
    const activeDocuments = await this.findActiveAgreementDocuments();
    return this.createAgreementDocuments(userId, activeDocuments);
  }

  async getActiveAgreementStatuses(
    userId: string,
  ): Promise<AgreementStatusResponse[]> {
    const activeDocuments = await this.findActiveAgreementDocuments();
    return this.createAgreementStatuses(userId, activeDocuments);
  }

  async hasAgreedAllRequiredAgreements(userId: string): Promise<boolean> {
    const activeDocuments = await this.findActiveAgreementDocuments();
    const requiredDocumentIds = activeDocuments
      .filter((document) => document.required)
      .map((document) => document.id);

    if (requiredDocumentIds.length === 0) {
      return true;
    }

    const agreements = await this.prisma.userAgreement.findMany({
      where: {
        userId,
        documentId: {
          in: requiredDocumentIds,
        },
        withdrawnAt: null,
      },
      select: {
        documentId: true,
      },
    });
    const agreedDocumentIds = new Set(
      agreements.map((agreement) => agreement.documentId),
    );

    return requiredDocumentIds.every((documentId) =>
      agreedDocumentIds.has(documentId),
    );
  }

  async agreeAgreements(
    params: AgreeAgreementsParams,
  ): Promise<AgreementStatusResponse[]> {
    const activeDocuments = await this.findActiveAgreementDocuments();
    const activeDocumentIds = new Set(
      activeDocuments.map((document) => document.id),
    );
    const invalidDocumentIds = params.agreementDocumentIds.filter(
      (documentId) => !activeDocumentIds.has(documentId),
    );

    if (invalidDocumentIds.length > 0) {
      throw new ConflictException({
        code: 'AGREEMENTS_CHANGED',
        message: '약관이 변경되었습니다. 다시 로그인해주세요.',
        invalidDocumentIds,
      });
    }

    const agreedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      for (const documentId of params.agreementDocumentIds) {
        const agreement = await tx.userAgreement.upsert({
          where: {
            userId_documentId: {
              userId: params.userId,
              documentId,
            },
          },
          update: {
            agreedAt,
            withdrawnAt: null,
          },
          create: {
            userId: params.userId,
            documentId,
            agreedAt,
          },
        });

        await tx.userAgreementEvent.create({
          data: {
            userId: params.userId,
            agreementId: agreement.id,
            documentId,
            action: AgreementAction.AGREED,
            ipAddress: params.ipAddress,
            userAgent: params.userAgent,
          },
        });
      }
    });

    return this.createAgreementStatuses(params.userId, activeDocuments);
  }

  async updateAgreementConsent(
    params: UpdateAgreementConsentParams,
  ): Promise<AgreementStatusResponse[]> {
    const activeDocuments = await this.findActiveAgreementDocuments();
    const activeDocument = activeDocuments.find(
      (document) => document.id === params.agreementDocumentId,
    );

    if (!activeDocument) {
      throw new ConflictException({
        code: 'AGREEMENTS_CHANGED',
        message: '약관이 변경되었습니다. 다시 로그인해주세요.',
        invalidDocumentIds: [params.agreementDocumentId],
      });
    }

    if (activeDocument.required) {
      throw new BadRequestException({
        code: 'REQUIRED_AGREEMENT_CANNOT_BE_UPDATED',
        message: '필수 약관 동의 상태는 변경할 수 없습니다.',
      });
    }

    const changedAt = new Date();
    const action = params.agreed
      ? AgreementAction.AGREED
      : AgreementAction.WITHDRAWN;

    await this.prisma.$transaction(async (tx) => {
      const agreement = await tx.userAgreement.upsert({
        where: {
          userId_documentId: {
            userId: params.userId,
            documentId: params.agreementDocumentId,
          },
        },
        update: params.agreed
          ? {
              agreedAt: changedAt,
              withdrawnAt: null,
            }
          : {
              withdrawnAt: changedAt,
            },
        create: {
          userId: params.userId,
          documentId: params.agreementDocumentId,
          agreedAt: changedAt,
          withdrawnAt: params.agreed ? null : changedAt,
        },
      });

      await tx.userAgreementEvent.create({
        data: {
          userId: params.userId,
          agreementId: agreement.id,
          documentId: params.agreementDocumentId,
          action,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
        },
      });
    });

    return this.createAgreementStatuses(params.userId, activeDocuments);
  }

  private async createAgreementStatuses(
    userId: string,
    activeDocuments: AgreementDocument[],
  ): Promise<AgreementStatusResponse[]> {
    const activeDocumentIds = activeDocuments.map((document) => document.id);

    if (activeDocumentIds.length === 0) {
      return [];
    }

    const agreements = await this.prisma.userAgreement.findMany({
      where: {
        userId,
        documentId: {
          in: activeDocumentIds,
        },
        withdrawnAt: null,
      },
      select: {
        documentId: true,
      },
    });
    const agreedDocumentIds = new Set(
      agreements.map((agreement) => agreement.documentId),
    );

    return activeDocuments.map((document) => ({
      type: document.type,
      documentId: document.id,
      version: document.version,
      title: document.title,
      required: document.required,
      agreed: agreedDocumentIds.has(document.id),
    }));
  }

  private async createAgreementDocuments(
    userId: string,
    activeDocuments: AgreementDocument[],
  ): Promise<AgreementDocumentResponse[]> {
    const activeDocumentIds = activeDocuments.map((document) => document.id);

    if (activeDocumentIds.length === 0) {
      return [];
    }

    const agreements = await this.prisma.userAgreement.findMany({
      where: {
        userId,
        documentId: {
          in: activeDocumentIds,
        },
        withdrawnAt: null,
      },
      select: {
        documentId: true,
      },
    });
    const agreedDocumentIds = new Set(
      agreements.map((agreement) => agreement.documentId),
    );

    return activeDocuments.map((document) => ({
      ...document,
      agreed: agreedDocumentIds.has(document.id),
    }));
  }

  private async findActiveAgreementDocuments(): Promise<AgreementDocument[]> {
    const documents = await this.prisma.agreementDocument.findMany({
      where: {
        retiredAt: null,
        effectiveAt: {
          lte: new Date(),
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
    const documentsByType = new Map<
      AgreementDocument['type'],
      AgreementDocument
    >();

    for (const document of documents) {
      if (!documentsByType.has(document.type)) {
        documentsByType.set(document.type, document);
      }
    }

    return Array.from(documentsByType.values());
  }
}
