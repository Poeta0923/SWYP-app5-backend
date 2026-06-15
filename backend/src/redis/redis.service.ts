import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { REDIS_URL_ENV } from './redis.constants';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private ready = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>(REDIS_URL_ENV);

    if (!redisUrl) {
      // 로컬 개발이나 Redis 미사용 환경에서는 앱 실행을 막지 않는다.
      this.logger.warn(`${REDIS_URL_ENV} is not set. Redis is disabled.`);
      return;
    }

    const client = new Redis(redisUrl, this.createRedisOptions());
    this.client = client;
    this.registerEventHandlers(client);

    try {
      await client.connect();
      await client.ping();
      this.ready = true;
      this.logger.log('Redis connection established.');
    } catch (error) {
      this.ready = false;
      this.logger.error('Failed to connect to Redis.', error);
      client.disconnect();
      throw error;
    }
  }

  async onModuleDestroy() {
    if (!this.client) {
      return;
    }

    await this.client.quit().catch((error: unknown) => {
      this.logger.warn('Redis quit failed. Closing connection forcefully.');
      this.logger.debug(error);
      this.client?.disconnect();
    });
  }

  getClient(): Redis {
    if (!this.client || !this.ready) {
      throw new Error('Redis client is not ready.');
    }

    return this.client;
  }

  isReady(): boolean {
    return this.ready;
  }

  async ping(): Promise<boolean> {
    if (!this.client || !this.ready) {
      return false;
    }

    const response = await this.client.ping();
    return response === 'PONG';
  }

  private createRedisOptions(): RedisOptions {
    return {
      // Nest lifecycle에서 직접 connect/ping을 수행해 시작 시점의 연결 실패를 명확히 잡는다.
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 2000),
    };
  }

  private registerEventHandlers(client: Redis) {
    client.on('ready', () => {
      // Redis가 명령을 받을 준비가 된 상태다.
      this.ready = true;
      this.logger.log('Redis client is ready.');
    });

    client.on('close', () => {
      // 연결이 닫힌 상태로, 재연결 중이거나 완전히 끊긴 경우 모두 포함한다.
      this.ready = false;
      this.logger.warn('Redis connection closed.');
    });

    client.on('reconnecting', () => {
      // ioredis가 retryStrategy에 따라 재연결을 시도하는 중이다.
      this.ready = false;
      this.logger.warn('Redis client is reconnecting.');
    });

    client.on('error', (error: Error) => {
      // 네트워크, 인증, 명령 처리 중 발생한 Redis client 오류를 기록한다.
      this.logger.error('Redis client error.', error);
    });
  }
}
