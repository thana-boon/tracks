# ─── Track (วิชาเสริม) — Next.js production image (standalone) ───
# Builds identically on Windows dev and Linux docker server. CRLF is normalised
# via .gitattributes; scripts are additionally sed-stripped below as a belt.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── Migrator: full deps (incl. drizzle-kit + tsx) + source. ───
# The one-shot `migrate` compose service applies the schema and exits. It does
# NOT seed — the app bootstraps its first admin itself at startup. This image
# still carries tsx + scripts/, which is how you reset a FORGOTTEN admin
# password (the startup bootstrap only ever acts when no admin exists):
#   docker compose run --rm migrate npx tsx scripts/seed-admin.ts
FROM node:22-alpine AS migrator
WORKDIR /app
RUN apk add --no-cache bash postgresql16-client
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN sed -i 's/\r$//' docker/entrypoint-migrate.sh && chmod +x docker/entrypoint-migrate.sh
CMD ["bash", "docker/entrypoint-migrate.sh"]

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# pg_dump/pg_restore power the in-app backup/restore page (admin only).
RUN apk add --no-cache postgresql16-client \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p /app/backups && chown nextjs:nodejs /app/backups

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
