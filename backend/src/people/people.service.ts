import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_JOB_NAMES,
  DEFAULT_POSITION_NAMES,
  DEFAULT_RELATIONSHIP_NAMES,
} from './people.constants';

export interface PersonCategoryNamesResponse {
  jobs: string[];
  companies: string[];
  positions: string[];
  relationships: string[];
}

@Injectable()
export class PeopleService {
  constructor(private readonly prisma: PrismaService) {}

  async getCategoryNames(userId: string): Promise<PersonCategoryNamesResponse> {
    await this.ensureDefaultCategories(userId);

    const [jobs, companies, positions, relationships] = await Promise.all([
      this.prisma.job.findMany({
        where: { userId },
        select: { name: true },
        orderBy: { name: Prisma.SortOrder.asc },
      }),
      this.prisma.company.findMany({
        where: { userId },
        select: { name: true },
        orderBy: { name: Prisma.SortOrder.asc },
      }),
      this.prisma.position.findMany({
        where: { userId },
        select: { name: true },
        orderBy: { name: Prisma.SortOrder.asc },
      }),
      this.prisma.relationship.findMany({
        where: { userId },
        select: { name: true },
        orderBy: { name: Prisma.SortOrder.asc },
      }),
    ]);

    return {
      jobs: jobs.map(({ name }) => name),
      companies: companies.map(({ name }) => name),
      positions: positions.map(({ name }) => name),
      relationships: relationships.map(({ name }) => name),
    };
  }

  private async ensureDefaultCategories(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.job.createMany({
        data: DEFAULT_JOB_NAMES.map((name) => ({ userId, name })),
        skipDuplicates: true,
      }),
      this.prisma.position.createMany({
        data: DEFAULT_POSITION_NAMES.map((name) => ({ userId, name })),
        skipDuplicates: true,
      }),
      this.prisma.relationship.createMany({
        data: DEFAULT_RELATIONSHIP_NAMES.map((name) => ({ userId, name })),
        skipDuplicates: true,
      }),
    ]);
  }
}
