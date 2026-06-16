export const HTTP_REQUESTS_TOTAL = 'http_requests_total';
export const HTTP_REQUEST_DURATION_SECONDS = 'http_request_duration_seconds';
export const HTTP_REQUESTS_IN_FLIGHT = 'http_requests_in_flight';
export const HTTP_METRICS_PATH = '/metrics';

// Prometheus label cardinality 폭증을 막기 위해 표준 HTTP method만 label로 사용한다.
export const HTTP_METHOD_LABEL_ALLOWLIST = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
];
export const HTTP_METHOD_LABEL_FALLBACK = 'OTHER';

// Prometheus scrape와 개발 문서 요청은 애플리케이션 HTTP 지표에서 제외한다.
export const HTTP_OBSERVABILITY_EXCLUDED_PATHS = [
  HTTP_METRICS_PATH,
  '/docs',
  '/docs-json',
  '/docs-yaml',
];

// API latency 분포를 보기 위한 histogram bucket. 단위는 초(seconds)다.
export const HTTP_REQUEST_DURATION_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];
