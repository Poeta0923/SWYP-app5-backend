import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { Pool } from 'pg';

/**
 * NestJS DI를 통해 PrismaClient 싱글턴을 관리하는 서비스.
 * 앱 라이프사이클에 연결해 DB 연결/해제를 자동으로 처리한다.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    // Rust 엔진 대신 pg 드라이버 어댑터를 사용한다 (Prisma 6 권장 방식).
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    super({ adapter: new PrismaPg(pool, { disposeExternalPool: true }) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    // graceful shutdown 시 커넥션 풀을 명시적으로 해제한다.
    await this.$disconnect();
  }
}
