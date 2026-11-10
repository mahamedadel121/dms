# Written for later deployment; never built on the dev machine (no Docker there, D1).
FROM node:24-slim AS base
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec playwright install --with-deps chromium
RUN pnpm db:generate
ENV NODE_ENV=production
# SERVICE selects what to run: api | web | bot | worker
ARG SERVICE=api
ENV SERVICE=${SERVICE}
CMD ["sh", "-c", "if [ \"$SERVICE\" = web ]; then pnpm --filter @dms/web build && pnpm --filter @dms/web start; else pnpm --filter @dms/$SERVICE start; fi"]
