import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_JOB_NAMES,
  DEFAULT_POSITION_NAMES,
  DEFAULT_RELATIONSHIP_NAMES,
} from './people.constants';
import { PeopleService } from './people.service';

describe('PeopleService', () => {
  let prisma: {
    $transaction: jest.Mock;
    job: {
      createMany: jest.Mock;
      findMany: jest.Mock;
    };
    company: {
      findMany: jest.Mock;
    };
    position: {
      createMany: jest.Mock;
      findMany: jest.Mock;
    };
    relationship: {
      createMany: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let service: PeopleService;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn().mockResolvedValue([]),
      job: {
        createMany: jest.fn(),
        findMany: jest.fn(),
      },
      company: {
        findMany: jest.fn(),
      },
      position: {
        createMany: jest.fn(),
        findMany: jest.fn(),
      },
      relationship: {
        createMany: jest.fn(),
        findMany: jest.fn(),
      },
    };
    service = new PeopleService(prisma as unknown as PrismaService);
  });

  it('ensures default categories and returns category names from the database', async () => {
    prisma.job.findMany.mockResolvedValue([
      { name: '개발/IT' },
      { name: '마케팅/홍보' },
      { name: '회계' },
    ]);
    prisma.company.findMany.mockResolvedValue([{ name: '토스' }]);
    prisma.position.findMany.mockResolvedValue([
      { name: '과장' },
      { name: '차장' },
    ]);
    prisma.relationship.findMany.mockResolvedValue([
      { name: '가족' },
      { name: '동료' },
    ]);

    await expect(service.getCategoryNames('user-1')).resolves.toEqual({
      jobs: ['개발/IT', '마케팅/홍보', '회계'],
      companies: ['토스'],
      positions: ['과장', '차장'],
      relationships: ['가족', '동료'],
    });

    expect(prisma.job.createMany).toHaveBeenCalledWith({
      data: DEFAULT_JOB_NAMES.map((name) => ({ userId: 'user-1', name })),
      skipDuplicates: true,
    });
    expect(prisma.position.createMany).toHaveBeenCalledWith({
      data: DEFAULT_POSITION_NAMES.map((name) => ({ userId: 'user-1', name })),
      skipDuplicates: true,
    });
    expect(prisma.relationship.createMany).toHaveBeenCalledWith({
      data: DEFAULT_RELATIONSHIP_NAMES.map((name) => ({
        userId: 'user-1',
        name,
      })),
      skipDuplicates: true,
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      undefined,
      undefined,
      undefined,
    ]);
    expect(prisma.job.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { name: true },
      orderBy: { name: Prisma.SortOrder.asc },
    });
    expect(prisma.company.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { name: true },
      orderBy: { name: Prisma.SortOrder.asc },
    });
    expect(prisma.position.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { name: true },
      orderBy: { name: Prisma.SortOrder.asc },
    });
    expect(prisma.relationship.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { name: true },
      orderBy: { name: Prisma.SortOrder.asc },
    });
  });
});
