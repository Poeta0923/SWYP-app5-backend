import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import {
  PrometheusModule,
  makeCounterProvider,
  makeGaugeProvider,
  makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';
import {
  HTTP_REQUESTS_TOTAL,
  HTTP_REQUEST_DURATION_BUCKETS,
  HTTP_REQUEST_DURATION_SECONDS,
  HTTP_REQUESTS_IN_FLIGHT,
} from './http-observability.constants';
import { HttpObservabilityInterceptor } from './http-observability.interceptor';

@Module({
  imports: [
    PrometheusModule.register({
      defaultLabels: {
        app: 'swyp-backend',
      },
    }),
  ],
  providers: [
    makeCounterProvider({
      name: HTTP_REQUESTS_TOTAL,
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
    }),
    makeHistogramProvider({
      name: HTTP_REQUEST_DURATION_SECONDS,
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: HTTP_REQUEST_DURATION_BUCKETS,
    }),
    makeGaugeProvider({
      name: HTTP_REQUESTS_IN_FLIGHT,
      help: 'Number of HTTP requests currently in flight',
      labelNames: ['method', 'route'],
    }),
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpObservabilityInterceptor,
    },
  ],
})
export class MetricsModule {}
