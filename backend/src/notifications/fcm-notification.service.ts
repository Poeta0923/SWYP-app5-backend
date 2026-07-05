import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseAdminService } from './firebase-admin.service';

const INVALID_TOKEN_ERROR_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);

export interface SendScheduleNotificationParams {
  userId: string;
  scheduleId: string;
  title: string;
  body: string;
}

export interface SendNotificationResult {
  successCount: number;
  failureCount: number;
  errorCode: string | null;
  errorMessage: string | null;
}

@Injectable()
export class FcmNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly firebaseAdminService: FirebaseAdminService,
  ) {}

  async sendScheduleNotification(
    params: SendScheduleNotificationParams,
  ): Promise<SendNotificationResult> {
    const pushTokens = await this.prisma.pushToken.findMany({
      where: {
        userId: params.userId,
        revokedAt: null,
      },
      select: {
        id: true,
        token: true,
      },
    });

    if (pushTokens.length === 0) {
      return {
        successCount: 0,
        failureCount: 0,
        errorCode: 'NO_ACTIVE_PUSH_TOKENS',
        errorMessage: '활성 푸시 토큰이 없습니다.',
      };
    }

    try {
      const response = await this.firebaseAdminService
        .getMessaging()
        .sendEachForMulticast({
          tokens: pushTokens.map((pushToken) => pushToken.token),
          notification: {
            title: params.title,
            body: params.body,
          },
          data: {
            type: 'SCHEDULE',
            scheduleId: params.scheduleId,
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
              },
            },
          },
        });

      const revokedAt = new Date();
      await Promise.all(
        response.responses.map(async (sendResponse, index) => {
          const errorCode = sendResponse.error?.code;

          if (!errorCode || !INVALID_TOKEN_ERROR_CODES.has(errorCode)) {
            return;
          }

          await this.prisma.pushToken.update({
            where: {
              id: pushTokens[index].id,
            },
            data: {
              revokedAt,
            },
          });
        }),
      );

      const firstError = response.responses.find(
        (sendResponse) => !sendResponse.success,
      )?.error;

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
        errorCode: firstError?.code ?? null,
        errorMessage: firstError?.message ?? null,
      };
    } catch (error) {
      return {
        successCount: 0,
        failureCount: pushTokens.length,
        errorCode: this.toErrorCode(error),
        errorMessage: this.toErrorMessage(error),
      };
    }
  }

  private toErrorCode(error: unknown): string {
    return typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
      ? error.code
      : 'FCM_SEND_FAILED';
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'FCM 발송에 실패했습니다.';
  }
}
