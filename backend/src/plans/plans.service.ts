import { Injectable } from '@nestjs/common';
import { UserPlan } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// 요금제별 부가 혜택 문구. 인물 수/용량/청구액과 달리 정형화하지 않고 표시용 텍스트로만 노출한다.
const PLAN_FEATURES: Record<UserPlan, string[]> = {
  [UserPlan.Basic]: ['AI 음성 요약 무제한'],
  [UserPlan.Pro]: ['AI 음성 요약 무제한'],
  [UserPlan.Premium]: [
    'AI 화자 분리',
    'AI 요약 모드 커스텀',
    '공유 링크 생성 (URL)',
  ],
};

// 응답에 노출할 요금제 순서(무료 → 유료 상위). DB 조회 순서에 의존하지 않는다.
const PLAN_ORDER: UserPlan[] = [UserPlan.Basic, UserPlan.Pro, UserPlan.Premium];

export type PlanDetail = Record<string, string>;

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async getPlans(): Promise<Record<string, PlanDetail>> {
    const plans = await this.prisma.plan.findMany();
    const byCode = new Map(plans.map((plan) => [plan.code, plan]));

    const result: Record<string, PlanDetail> = {};
    for (const code of PLAN_ORDER) {
      const plan = byCode.get(code);
      if (!plan) continue;

      result[code] = {
        charge: String(plan.priceMonthly),
        maxPeople: formatMaxPeople(plan.maxPeople),
        volume: `클라우드 ${formatStorage(plan.storageLimitMb)}`,
        ...toFeatureFields(PLAN_FEATURES[code]),
      };
    }
    return result;
  }
}

/** 인물 등록 한도를 표시 문구로 변환한다. NULL은 무제한을 뜻한다. */
function formatMaxPeople(maxPeople: number | null): string {
  return maxPeople === null
    ? '인물 등록 무제한'
    : `인물 등록 최대 ${maxPeople}명`;
}

/** MB 단위 용량을 사람이 읽는 문구로 변환한다. 1024로 딱 떨어지면 GB, 아니면 MB. */
function formatStorage(mb: number): string {
  return mb >= 1024 && mb % 1024 === 0 ? `${mb / 1024}GB` : `${mb}MB`;
}

/** 혜택 문자열 배열을 feature1, feature2, ... 키를 가진 객체로 펼친다. */
function toFeatureFields(features: string[]): Record<string, string> {
  return features.reduce<Record<string, string>>((acc, feature, index) => {
    acc[`feature${index + 1}`] = feature;
    return acc;
  }, {});
}
