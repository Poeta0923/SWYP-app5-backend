import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const ACTIVE_SESSION_KEY_PREFIX = 'auth:active-session';
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
      if (activeFamilyId !== familyId) {
        throw this.createSessionRevokedException();
      }

      return;
    }

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

    await this.setActiveSession(userId, familyId, ttlSeconds);
  }

  private createSessionRevokedException(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'SESSION_REVOKED',
      message: '다른 기기에서 로그인되어 현재 세션이 종료되었습니다.',
    });
  }
}
