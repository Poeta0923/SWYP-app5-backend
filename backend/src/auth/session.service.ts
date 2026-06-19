import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
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

  async assertActiveSession(userId: string, familyId: string): Promise<void> {
    const activeFamilyId = await this.getActiveSession(userId);

    if (!activeFamilyId || activeFamilyId !== familyId) {
      throw new UnauthorizedException({
        code: 'SESSION_REVOKED',
        message: '다른 기기에서 로그인되어 현재 세션이 종료되었습니다.',
      });
    }
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
}
