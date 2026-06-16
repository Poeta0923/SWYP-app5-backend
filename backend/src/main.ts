import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { shouldBlockMetricsInProduction } from './common/metrics/metrics-production-access';

const isMetricsPath = (path: string): boolean =>
  path === '/metrics' || path.startsWith('/metrics/');

const isValidMetricsBasicAuth = (
  authorization: string | undefined,
): boolean => {
  const username = process.env.METRICS_USERNAME;
  const password = process.env.METRICS_PASSWORD;

  if (!username || !password) {
    return true;
  }

  if (!authorization?.startsWith('Basic ')) {
    return false;
  }

  const credentials = Buffer.from(
    authorization.slice('Basic '.length),
    'base64',
  ).toString('utf8');
  const separatorIndex = credentials.indexOf(':');

  if (separatorIndex === -1) {
    return false;
  }

  return (
    credentials.slice(0, separatorIndex) === username &&
    credentials.slice(separatorIndex + 1) === password
  );
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // 로거 준비 전 발생하는 시작 로그가 유실되지 않도록 버퍼에 저장
    bufferLogs: true,
  });

  // NestJS 내장 Logger를 Winston으로 교체 (Loki로 로그 push 포함)
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  app.use(
    helmet({
      // 개발 환경에서는 Swagger UI가 정상 렌더링되도록 CSP만 비활성화한다.
      contentSecurityPolicy:
        process.env.NODE_ENV === 'production' ? undefined : false,
    }),
  );

  // 운영에서는 Grafana Cloud scrape를 명시적으로 허용한 경우에만 /metrics를 노출한다.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      shouldBlockMetricsInProduction({
        nodeEnv: process.env.NODE_ENV,
        metricsEnabledInProduction: process.env.METRICS_ENABLED_IN_PRODUCTION,
        path: req.path,
      })
    ) {
      res.status(404).send('Not Found');
      return;
    }

    // METRICS_USERNAME/PASSWORD가 설정되어 있으면 /metrics에 Basic Auth를 요구한다.
    if (
      isMetricsPath(req.path) &&
      !isValidMetricsBasicAuth(req.headers.authorization)
    ) {
      res.setHeader('WWW-Authenticate', 'Basic realm="metrics"');
      res.status(401).send('Unauthorized');
      return;
    }

    next();
  });

  // 운영 환경에서는 등록된 프론트엔드 도메인만 허용하고, 개발 환경에서는 로컬 테스트를 열어둔다.
  app.enableCors({
    origin:
      process.env.NODE_ENV === 'production' ? process.env.FRONTEND_URL : true,
    credentials: true,
  });

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('SWYP-app5-7team API')
      .setDescription('스위프 앱 5기 7팀 API 문서입니다.')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'access-token',
          description: 'Enter access token',
          in: 'header',
        },
        'access-token',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  app.useGlobalPipes(
    new ValidationPipe({
      // DTO에 선언되지 않은 값은 제거하고, 알 수 없는 필드는 요청 오류로 처리한다.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
