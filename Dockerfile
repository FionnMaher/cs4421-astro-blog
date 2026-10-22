# STAGE 1: Build & Compile
FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# STAGE 2: Lean Production Runner
FROM node:24-alpine AS runner

ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder --chown=node:node /app/dist ./dist

USER node

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4321/api/health/live || exit 1

EXPOSE 4321

CMD ["node", "./dist/server/entry.mjs"]
