import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PubSubEnvelope } from './google-play-rtdn.types';
import {
  ParsedRtdnMessage,
  classifyNotification,
  parseEnvelope,
} from './rtdn-notification.parser';

@Injectable()
export class GooglePlayRtdnService {
  private readonly logger = new Logger(GooglePlayRtdnService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * RTDN Pub/Sub envelope를 파싱해 이벤트를 저장한다(RECEIVED). 실제 처리는 워커가 담당.
   * messageId 유니크로 중복 수신을 흡수하므로 재전송돼도 안전하다.
   *
   * @throws BadRequestException envelope 형식이 잘못됐을 때
   */
  async storeEvent(body: PubSubEnvelope): Promise<void> {
    let parsed: ParsedRtdnMessage;
    try {
      parsed = parseEnvelope(body);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid RTDN payload',
      );
    }

    const { messageId, notification } = parsed;
    const classified = classifyNotification(notification);
    const purchaseToken =
      classified.kind === 'subscription' || classified.kind === 'voided'
        ? classified.purchaseToken
        : null;
    const notificationType =
      classified.kind === 'subscription' ? classified.notificationType : null;

    try {
      await this.prisma.googlePlayRtdnEvent.create({
        data: {
          messageId,
          packageName: notification.packageName ?? null,
          purchaseToken,
          notificationType: notificationType ?? null,
          eventTime: notification.eventTimeMillis
            ? new Date(Number(notification.eventTimeMillis))
            : null,
          payload: notification as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      // messageId 유니크 충돌(P2002) = 이미 받은 메시지. 멱등하게 무시.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.debug(`중복 RTDN 메시지 무시: ${messageId}`);
        return;
      }
      throw error;
    }
  }
}
