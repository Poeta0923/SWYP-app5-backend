import { HTTP_METRICS_PATH } from './http-observability.constants';

// 운영 환경에서는 명시적으로 허용한 경우에만 /metrics를 노출한다.
export const shouldBlockMetricsInProduction = ({
  nodeEnv,
  metricsEnabledInProduction,
  path,
}: {
  nodeEnv: string | undefined;
  metricsEnabledInProduction: string | undefined;
  path: string;
}): boolean =>
  nodeEnv === 'production' &&
  metricsEnabledInProduction !== 'true' &&
  (path === HTTP_METRICS_PATH || path.startsWith(`${HTTP_METRICS_PATH}/`));
