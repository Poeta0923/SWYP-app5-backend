import { Injectable } from '@nestjs/common';
import type {
  AgreementDocument,
  AgreementType,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AgreementStatusResponse {
  type: AgreementType;
  documentId: string;
  version: string;
  title: string;
  required: boolean;
  agreed: boolean;
}

@Injectable()
export class AgreementsService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveAgreements(): Promise<AgreementDocument[]> {
    return this.findActiveAgreementDocuments();
  }

  async getActiveAgreementStatuses(
    userId: string,
  ): Promise<AgreementStatusResponse[]> {
    const activeDocuments = await this.findActiveAgreementDocuments();
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
