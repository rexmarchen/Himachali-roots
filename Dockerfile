# syntax=docker/dockerfile:1
# Production image for the single-node Express + SQLite deployment.
# The SPA and API are served by the same Node process.

FROM node:24-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
ENV NODE_OPTIONS="--max-old-space-size=450"
RUN npm run build \
    && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends gosu ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system pahadi \
    && useradd --system --gid pahadi --home-dir /app --shell /usr/sbin/nologin pahadi \
    && mkdir -p /data /storage/uploads /storage/private/seller-docs /backups \
    && chown -R pahadi:pahadi /app /data /storage /backups

COPY --from=build --chown=pahadi:pahadi /app/package.json /app/package-lock.json ./
COPY --from=build --chown=pahadi:pahadi /app/node_modules ./node_modules
COPY --from=build --chown=pahadi:pahadi /app/dist ./dist
COPY --from=build --chown=pahadi:pahadi /app/dist-server ./dist-server
COPY --from=build --chown=pahadi:pahadi /app/scripts/backup-db.mjs /app/scripts/verify-backup.mjs ./scripts/
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist-server/server/index.js"]
