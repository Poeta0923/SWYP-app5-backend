FROM node:22-alpine AS base

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

FROM base AS deps

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

FROM deps AS build

COPY nest-cli.json tsconfig.json tsconfig.build.json prisma.config.ts ./
COPY prisma ./prisma
COPY scripts ./scripts
COPY src ./src

RUN DATABASE_URL="postgresql://user:password@localhost:5432/app" \
    DIRECT_URL="postgresql://user:password@localhost:5432/app" \
    pnpm run build

FROM base AS runner

ENV NODE_ENV=production

# 음성 STT 전 오디오 다운샘플(16kHz mono)에 ffmpeg를 런타임에 사용한다.
RUN apk add --no-cache ffmpeg

# prisma CLI가 devDependency라 prod 설치에서 누락되므로, entrypoint의
# migrate deploy를 위해 deps의 node_modules를 통째로 가져온다.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/generated ./generated
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY entrypoint.sh ./entrypoint.sh

RUN chmod +x entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
