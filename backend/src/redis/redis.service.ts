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
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 2000),
    };
  }

  private registerEventHandlers(client: Redis) {
    client.on('ready', () => {
      this.ready = true;
      this.logger.log('Redis client is ready.');
    });

    client.on('close', () => {
      this.ready = false;
      this.logger.warn('Redis connection closed.');
    });

    client.on('reconnecting', () => {
      this.ready = false;
      this.logger.warn('Redis client is reconnecting.');
    });

    client.on('error', (error: Error) => {
      this.logger.error('Redis client error.', error);
    });
  }
}
