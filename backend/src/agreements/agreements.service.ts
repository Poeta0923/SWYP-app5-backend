import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type AgreementDocument,
  AgreementType,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AgreementsService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveAgreement(type: AgreementType): Promise<AgreementDocument> {
    const document = await this.prisma.agreementDocument.findFirst({
      where: {
        type,
        retiredAt: null,
        effectiveAt: {
          lte: new Date(),
        },
      },
      orderBy: {
        effectiveAt: 'desc',
      },
    });

    if (!document) {
      throw new NotFoundException('활성화된 약관이 없습니다.');
    }

    return document;
  }
}
