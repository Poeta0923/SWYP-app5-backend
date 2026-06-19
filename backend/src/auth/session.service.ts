import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const ACTIVE_SESSION_KEY_PREFIX = 'auth:active-session';

@Injectable()
export class SessionService {
  constructor(private readonly redisService: RedisService) {}

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

  private createActiveSessionKey(userId: string): string {
    return `${ACTIVE_SESSION_KEY_PREFIX}:${userId}`;
  }
}
