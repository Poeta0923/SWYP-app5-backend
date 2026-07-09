#!/bin/sh
set -e

# 컨테이너 시작 시 마이그레이션을 적용한다. pnpm/corepack을 거치면 런타임에
# pnpm을 내려받으려 하므로 node_modules의 prisma CLI를 직접 호출한다.
node_modules/.bin/prisma migrate deploy

# exec로 교체해야 node가 PID 1이 되어 SIGTERM을 직접 받는다 (graceful shutdown).
exec node dist/src/main.js
