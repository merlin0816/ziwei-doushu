# syntax=docker/dockerfile:1
# ziwei-doushu（紫微斗数开源排盘引擎）—— 自建运行时镜像
# 上游仓库不带 Dockerfile，所以由 DSH 侧维护这一份；升级 = git pull + 重新 build

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates git \
 && rm -rf /var/lib/apt/lists/*

# 依赖层（利用缓存）：.npmrc 决定是否 legacy-peer-deps，必须一起带上
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

# 源码 + 构建（仓库根没有 public/，先建空目录以免后续 COPY 失败）
COPY . .
RUN mkdir -p public && npm run build

# 去掉 devDependencies（tailwind / typescript / tsx 构建完用不上了）
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    TZ=Asia/Shanghai
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates zstd \
 && rm -rf /var/lib/apt/lists/*
# 解读数据集缓存目录（挂宿主 /opt/ziwei-doushu/data；每年约 2 MB 压缩）
RUN mkdir -p /data/cache

COPY --from=builder /app/package.json /app/package-lock.json /app/next.config.js ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npx", "next", "start", "-p", "3000"]
