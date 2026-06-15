import { Module } from '@nestjs/common';
import { RedisService } from './redis.service';

@Module({
  providers: [RedisService],
  // 기능 모듈에서 캐시, TTL 데이터, rate limit 등에 재사용할 수 있도록 export한다.
  exports: [RedisService],
})
export class RedisModule {}
