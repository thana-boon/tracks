#!/usr/bin/env bash
# One-shot schema migrate. Waits for the EXTERNAL postgres-core to accept
# connections, then applies pending SQL migrations (drizzle/*.sql) and exits.
#
# Fully non-interactive and idempotent: safe to run on every `up`. Unlike
# `push`, `migrate` never prompts for rename detection, so startup can't hang
# waiting on a TTY.
#
# There is deliberately NO admin seed here — the app bootstraps its first admin
# in-process at startup (src/instrumentation.ts).
set -euo pipefail

# Bounded wait: postgres-core is outside this stack, so compose can't gate on
# its health. Give up after ~60s and let compose's `restart: on-failure` retry
# rather than hanging the deploy forever.
echo "[migrate] waiting for postgres-core…"
for i in $(seq 1 60); do
  if pg_isready -d "$DATABASE_URL" >/dev/null 2>&1; then
    echo "[migrate] postgres is ready"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "[migrate] postgres unreachable after 60s — is postgres-core up and on school-net?" >&2
    exit 1
  fi
  sleep 1
done

echo "[migrate] applying Drizzle migrations…"
npx drizzle-kit migrate

echo "[migrate] done."
