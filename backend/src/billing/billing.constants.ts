// Google Play Developer API 서비스 계정 자격증명(JSON 문자열) env 키.
// FIREBASE_SERVICE_ACCOUNT_JSON과 동일하게 값이 '{'로 시작하는 원본 JSON이어야 한다.
export const GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_ENV =
  'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON';

// 구독 상태 조회에 필요한 OAuth 스코프.
export const ANDROID_PUBLISHER_SCOPE =
  'https://www.googleapis.com/auth/androidpublisher';

// Google Play Developer API v3 base URL. subscriptionsv2.get 엔드포인트에 사용.
export const ANDROID_PUBLISHER_API_BASE =
  'https://androidpublisher.googleapis.com/androidpublisher/v3';

// 외부 호출 타임아웃(ms).
export const GOOGLE_PLAY_API_TIMEOUT_MS = 10_000;
