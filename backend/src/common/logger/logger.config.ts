import { ConfigService } from '@nestjs/config';
import { WinstonModuleOptions } from 'nest-winston';
import * as winston from 'winston';
import LokiTransport from 'winston-loki';

// Nest Logger가 넘기는 message/context 값이 객체여도 콘솔에서 읽을 수 있게 문자열로 정리한다.
const stringifyLogValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol'
  ) {
    return value.toString();
  }

  if (value instanceof Error) {
    return value.stack ?? value.message;
  }

  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '[Unserializable log value]';
  }
};

// 로컬 개발과 Railway 기본 로그에서 바로 읽을 수 있는 콘솔 출력 형식을 만든다.
const createConsoleTransport = () =>
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, context }) => {
        const logTimestamp = stringifyLogValue(timestamp);
        const logContext =
          context === null || context === undefined
            ? 'App'
            : stringifyLogValue(context);
        const logLevel = stringifyLogValue(level);
        const logMessage = stringifyLogValue(message);

        return `${logTimestamp} [${logContext}] ${logLevel}: ${logMessage}`;
      }),
    ),
  });

// Grafana Cloud Logs 설정값이 모두 있을 때만 Loki transport를 활성화한다.
const createLokiTransport = (config: ConfigService) => {
  const host = config.get<string>('LOKI_URL');
  const username = config.get<string>('LOKI_USERNAME');
  const password = config.get<string>('LOKI_PASSWORD');

  if (!host || !username || !password) {
    // 로컬 개발이나 Grafana 미연결 환경에서는 콘솔 로그만 사용한다.
    return null;
  }

  return new LokiTransport({
    host,
    basicAuth: `${username}:${password}`,
    labels: {
      app: 'swyp-backend',
      env: config.get<string>('NODE_ENV') ?? 'development',
      platform: 'railway',
      service: config.get<string>('RAILWAY_SERVICE_NAME') ?? 'backend',
      deployment: config.get<string>('RAILWAY_DEPLOYMENT_ID') ?? 'local',
    },
    json: true,
    format: winston.format.json(),
    replaceTimestamp: true,
    onConnectionError: (error) => {
      // Loki 장애가 애플리케이션 장애로 번지지 않도록 연결 오류는 로깅만 한다.
      console.error('Loki connection error:', error);
    },
  });
};

// nest-winston이 사용할 transport 목록을 구성한다.
export const createLoggerOptions = (
  config: ConfigService,
): WinstonModuleOptions => {
  const transports: WinstonModuleOptions['transports'] = [
    createConsoleTransport(),
  ];
  const lokiTransport = createLokiTransport(config);

  if (lokiTransport) {
    transports.push(lokiTransport);
  }

  return { transports };
};
