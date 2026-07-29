import { ForbiddenException, Injectable } from '@nestjs/common';
import { MediaFileUsage } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const BYTES_PER_MEGABYTE = 1024 * 1024;

interface PlanLimits {
  maxPeople: number | null; // null = 무제한
  storageLimitMb: number;
}

/**
 * 요금제 한도(인물 수·음성 저장 용량)를 서버에서 강제한다.
 * User.plan → Plan 카탈로그 한도를 조회해 생성/업로드 전에 초과 여부를 검사한다.
 */
@Injectable()
export class EntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 인물을 addCount만큼 추가할 수 있는지 검사한다. 무제한 요금제면 통과.
   *
   * @throws ForbiddenException 한도를 초과할 때(PLAN_PEOPLE_LIMIT_EXCEEDED)
   */
  async assertCanAddPeople(userId: string, addCount = 1): Promise<void> {
    const { maxPeople } = await this.getLimits(userId);
    if (maxPeople === null) return;

    const current = await this.prisma.person.count({ where: { userId } });
    if (current + addCount > maxPeople) {
      throw new ForbiddenException({
        code: 'PLAN_PEOPLE_LIMIT_EXCEEDED',
        message: `현재 요금제의 인물 등록 한도(${maxPeople}명)를 초과합니다.`,
      });
    }
  }

  /**
   * 음성 녹음 저장 용량에 addBytes를 더 쓸 수 있는지 검사한다.
   * 요금제 조회 API가 노출하는 "클라우드 용량"과 동일하게 RECORD_VOICE 미디어만 합산한다.
   *
   * @throws ForbiddenException 한도를 초과할 때(PLAN_STORAGE_LIMIT_EXCEEDED)
   */
  async assertVoiceStorageAvailable(
    userId: string,
    addBytes: number,
  ): Promise<void> {
    const { storageLimitMb } = await this.getLimits(userId);
    const limitBytes = storageLimitMb * BYTES_PER_MEGABYTE;

    const aggregate = await this.prisma.mediaFile.aggregate({
      where: { userId, usage: MediaFileUsage.RECORD_VOICE },
      _sum: { sizeBytes: true },
    });
    const usedBytes = aggregate._sum.sizeBytes ?? 0;

    if (usedBytes + addBytes > limitBytes) {
      throw new ForbiddenException({
        code: 'PLAN_STORAGE_LIMIT_EXCEEDED',
        message: '현재 요금제의 저장 용량을 초과합니다.',
      });
    }
  }

  /** User.plan에 해당하는 Plan 카탈로그 한도를 읽는다. 카탈로그 누락 시 강제하지 않는다(fail-open). */
  private async getLimits(userId: string): Promise<PlanLimits> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { plan: true },
    });
    const plan = await this.prisma.plan.findUnique({
      where: { code: user.plan },
      select: { maxPeople: true, storageLimitMb: true },
    });
    if (!plan) {
      return { maxPeople: null, storageLimitMb: Number.POSITIVE_INFINITY };
    }
    return { maxPeople: plan.maxPeople, storageLimitMb: plan.storageLimitMb };
  }
}
