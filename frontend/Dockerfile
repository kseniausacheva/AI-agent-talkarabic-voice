# Multi-stage build для Next.js 16 standalone
# Output: ~150 МБ образ вместо ~1 ГБ

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time env (можно передать через --build-arg или ARG)
ARG NEXT_PUBLIC_USE_MOCK=false
ARG NEXT_PUBLIC_API_URL=http://backend:7860
ENV NEXT_PUBLIC_USE_MOCK=$NEXT_PUBLIC_USE_MOCK
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Создаём non-root пользователя
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

# Копируем standalone build + статические ассеты
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
