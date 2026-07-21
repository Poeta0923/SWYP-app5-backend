import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAuth } from 'google-auth-library';
import {
  ANDROID_PUBLISHER_API_BASE,
  ANDROID_PUBLISHER_SCOPE,
  GOOGLE_PLAY_API_TIMEOUT_MS,
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_ENV,
} from './billing.constants';
import { SubscriptionPurchaseV2 } from './google-subscription.mapper';

/**
 * Google Play Developer API 호출을 담당하는 외부 경계.
 * 서비스 계정으로 access token을 발급받아 subscriptionsv2.get을 호출한다.
 * 테스트에서는 이 클래스를 mock으로 대체한다.
 */
@Injectable()
export class GooglePlayApiClient {
  // 서비스 계정 JSON은 최초 호출 시 lazy 파싱한다(미설정 환경에서 부팅 실패 방지).
  private auth?: GoogleAuth;

  constructor(private readonly configService: ConfigService) {}

  /**
   * 구독 상태를 조회한다.
   *
   * @param packageName 앱 패키지명
   * @param purchaseToken 구매 토큰
   * @returns subscriptionsv2.get 응답
   * @throws BadGatewayException Google 호출 실패/타임아웃 시
   */
  async getSubscription(
    packageName: string,
    purchaseToken: string,
  ): Promise<SubscriptionPurchaseV2> {
    const token = await this.getAccessToken();
    const url =
      `${ANDROID_PUBLISHER_API_BASE}/applications/${encodeURIComponent(packageName)}` +
      `/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;

    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new BadGatewayException({
        code: 'GOOGLE_PLAY_VERIFY_FAILED',
        message: '구글 플레이 구독 검증에 실패했습니다.',
        statusCode: response.status,
      });
    }

    return (await response.json()) as SubscriptionPurchaseV2;
  }

  /** 서비스 계정으로 androidpublisher access token을 발급한다. */
  private async getAccessToken(): Promise<string> {
    const token = await this.getAuth().getAccessToken();
    if (!token) {
      throw new BadGatewayException({
        code: 'GOOGLE_PLAY_AUTH_FAILED',
        message: '구글 플레이 인증 토큰 발급에 실패했습니다.',
      });
    }
    return token;
  }

  private getAuth(): GoogleAuth {
    if (this.auth) return this.auth;

    const raw = this.configService.get<string>(
      GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_ENV,
    );
    if (!raw) {
      throw new Error(
        `${GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_ENV} is required for Google Play verification.`,
      );
    }

    this.auth = new GoogleAuth({
      credentials: JSON.parse(raw) as Record<string, unknown>,
      scopes: [ANDROID_PUBLISHER_SCOPE],
    });
    return this.auth;
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      GOOGLE_PLAY_API_TIMEOUT_MS,
    );

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BadGatewayException({
          code: 'GOOGLE_PLAY_VERIFY_TIMEOUT',
          message: '구글 플레이 구독 검증이 시간 내에 완료되지 않았습니다.',
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
