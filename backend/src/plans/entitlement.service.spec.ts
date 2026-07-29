import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementService } from './entitlement.service';

interface PrismaMock {
  user: { findUniqueOrThrow: jest.Mock };
  plan: { findUnique: jest.Mock };
  person: { count: jest.Mock };
  mediaFile: { aggregate: jest.Mock };
}

const MB = 1024 * 1024;

describe('EntitlementService', () => {
  let prisma: PrismaMock;
  let service: EntitlementService;

  beforeEach(() => {
    prisma = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ plan: 'Basic' }),
      },
      plan: { findUnique: jest.fn() },
      person: { count: jest.fn() },
      mediaFile: { aggregate: jest.fn() },
    };
    service = new EntitlementService(prisma as unknown as PrismaService);
  });

  describe('assertCanAddPeople', () => {
    it('한도 미만이면 통과', async () => {
      prisma.plan.findUnique.mockResolvedValue({ maxPeople: 50 });
      prisma.person.count.mockResolvedValue(49);

      await expect(
        service.assertCanAddPeople('user-1', 1),
      ).resolves.toBeUndefined();
    });

    it('한도를 넘기면 ForbiddenException', async () => {
      prisma.plan.findUnique.mockResolvedValue({ maxPeople: 50 });
      prisma.person.count.mockResolvedValue(50);

      await expect(service.assertCanAddPeople('user-1', 1)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('배치 임포트: 현재+추가가 한도를 넘기면 거부', async () => {
      prisma.plan.findUnique.mockResolvedValue({ maxPeople: 50 });
      prisma.person.count.mockResolvedValue(48);

      await expect(service.assertCanAddPeople('user-1', 5)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('maxPeople이 null(무제한)이면 count 조회 없이 통과', async () => {
      prisma.plan.findUnique.mockResolvedValue({ maxPeople: null });

      await expect(
        service.assertCanAddPeople('user-1', 1000),
      ).resolves.toBeUndefined();
      expect(prisma.person.count).not.toHaveBeenCalled();
    });

    it('카탈로그 누락 시 강제하지 않음(fail-open)', async () => {
      prisma.plan.findUnique.mockResolvedValue(null);

      await expect(
        service.assertCanAddPeople('user-1', 1),
      ).resolves.toBeUndefined();
    });
  });

  describe('assertVoiceStorageAvailable', () => {
    it('한도 내면 통과', async () => {
      prisma.plan.findUnique.mockResolvedValue({ storageLimitMb: 300 });
      prisma.mediaFile.aggregate.mockResolvedValue({
        _sum: { sizeBytes: 100 * MB },
      });

      await expect(
        service.assertVoiceStorageAvailable('user-1', 50 * MB),
      ).resolves.toBeUndefined();
    });

    it('한도를 넘기면 ForbiddenException', async () => {
      prisma.plan.findUnique.mockResolvedValue({ storageLimitMb: 300 });
      prisma.mediaFile.aggregate.mockResolvedValue({
        _sum: { sizeBytes: 280 * MB },
      });

      await expect(
        service.assertVoiceStorageAvailable('user-1', 30 * MB),
      ).rejects.toThrow(ForbiddenException);
    });

    it('사용량이 없어도(null) 정상 계산', async () => {
      prisma.plan.findUnique.mockResolvedValue({ storageLimitMb: 300 });
      prisma.mediaFile.aggregate.mockResolvedValue({
        _sum: { sizeBytes: null },
      });

      await expect(
        service.assertVoiceStorageAvailable('user-1', 10 * MB),
      ).resolves.toBeUndefined();
    });
  });
});
