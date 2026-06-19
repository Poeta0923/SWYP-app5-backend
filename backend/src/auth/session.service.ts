import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const ACTIVE_SESSION_KEY_PREFIX = 'auth:active-session';
// 로그인 중 DB 커밋 실패가 나도 잘못된 Redis 세션이 오래 남지 않도록 짧은 TTL을 사용한다.
const PENDING_ACTIVE_SESSION_TTL_SECONDS = 60;
const ACTIVE_SESSION_DELETE_RETRY_COUNT = 2;

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async setPendingActiveSession(
    userId: string,
    familyId: string,
  ): Promise<void> {
    // Redis-first 로그인 흐름의 첫 단계다. 이 단계가 실패하면 DB 세션은 건드리지 않는다.
    await this.setActiveSession(
      userId,
      familyId,
      PENDING_ACTIVE_SESSION_TTL_SECONDS,
    );
  }

  async promoteActiveSession(
    userId: string,
    familyId: string,
    ttlSeconds: number,
  ): Promise<void> {
    // DB 세션 활성화가 끝난 뒤 pending TTL을 refresh token 만료 시간에 맞춘다.
    await this.setActiveSession(userId, familyId, ttlSeconds);
  }

  async deleteActiveSessionIfMatches(
    userId: string,
    familyId: string,
  ): Promise<void> {
    let lastError: unknown;

    for (
      let attempt = 1;
      attempt <= ACTIVE_SESSION_DELETE_RETRY_COUNT;
      attempt++
    ) {
      try {
        if (!this.redisService.isReady()) {
          throw new ServiceUnavailableException('Redis client is not ready.');
        }

        const client = this.redisService.getClient();
        const key = this.createActiveSessionKey(userId);
        const activeFamilyId = await client.get(key);

        // 다른 요청이 이미 새 familyId를 쓴 경우에는 그 값을 지우면 안 된다.
        if (activeFamilyId !== familyId) {
          return;
        }

        await client.del(key);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    this.logger.error(
      `Failed to delete pending active session after ${ACTIVE_SESSION_DELETE_RETRY_COUNT} attempts.`,
      lastError,
    );
  }

  async setActiveSession(
    userId: string,
    familyId: string,
    ttlSeconds: number,
  ): Promise<void> {
    // Redis 장애 시에는 DB fallback으로 우회하지 않고 fail-closed 방향으로 실패시킨다.
    if (!this.redisService.isReady()) {
      throw new ServiceUnavailableException('Redis client is not ready.');
    }

    await this.redisService
      .getClient()
      .set(this.createActiveSessionKey(userId), familyId, 'EX', ttlSeconds);
  }

  async assertActiveSession(userId: string, familyId: string): Promise<void> {
    const activeFamilyId = await this.getActiveSession(userId);

    if (activeFamilyId) {
      // Redis 값이 있으면 fast path로 간주하고 DB는 보지 않는다. stale 값도 즉시 차단 정책을 따른다.
      if (activeFamilyId !== familyId) {
        throw this.createSessionRevokedException();
      }

      return;
    }

    // Redis key miss일 때만 DB를 영속 기준으로 확인하고 Redis를 복구한다.
    await this.assertActiveSessionFromDatabase(userId, familyId);
  }

  async getActiveSession(userId: string): Promise<string | null> {
    if (!this.redisService.isReady()) {
      throw new ServiceUnavailableException('Redis client is not ready.');
    }

    return this.redisService
      .getClient()
      .get(this.createActiveSessionKey(userId));
  }

  private createActiveSessionKey(userId: string): string {
    return `${ACTIVE_SESSION_KEY_PREFIX}:${userId}`;
  }

  private async assertActiveSessionFromDatabase(
    userId: string,
    familyId: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        activeRefreshFamilyId: true,
      },
    });

    if (user?.activeRefreshFamilyId !== familyId) {
      throw this.createSessionRevokedException();
    }

    const refreshToken = await this.prisma.refreshToken.findFirst({
      where: {
        userId,
        familyId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        expiresAt: 'desc',
      },
      select: {
        expiresAt: true,
      },
    });

    if (!refreshToken) {
      throw this.createSessionRevokedException();
    }

    const ttlSeconds = Math.floor(
      (refreshToken.expiresAt.getTime() - Date.now()) / 1000,
    );

    if (ttlSeconds <= 0) {
      throw this.createSessionRevokedException();
    }

    // Redis eviction/miss 이후의 정상 세션은 DB 기준으로 확인한 뒤 다시 캐싱한다.
    await this.setActiveSession(userId, familyId, ttlSeconds);
  }

  private createSessionRevokedException(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'SESSION_REVOKED',
      message: '다른 기기에서 로그인되어 현재 세션이 종료되었습니다.',
    });
  }
}
