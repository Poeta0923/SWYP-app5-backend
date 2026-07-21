import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { GooglePlayRtdnSecretGuard } from './google-play-rtdn-secret.guard';
import { GooglePlayRtdnService } from './google-play-rtdn.service';
import type { PubSubEnvelope } from './google-play-rtdn.types';

// 구글 Pub/Sub이 호출하는 RTDN 웹훅. JWT가 아니라 시크릿 토큰(?token=)으로 보호하며
// Swagger 문서에는 노출하지 않는다. body는 임의 JSON이라 DTO 없이 받아 전역
// ValidationPipe(forbidNonWhitelisted)를 우회한다.
@ApiExcludeController()
@Controller('billing/google')
export class GooglePlayRtdnController {
  constructor(private readonly rtdnService: GooglePlayRtdnService) {}

  @Post('rtdn')
  @UseGuards(GooglePlayRtdnSecretGuard)
  @HttpCode(HttpStatus.OK)
  async handleRtdn(@Body() body: PubSubEnvelope): Promise<void> {
    // 저장만 하고 즉시 200으로 ack. 실제 처리는 워커가 비동기로 수행한다.
    await this.rtdnService.storeEvent(body);
  }
}
