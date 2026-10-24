import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { apiKeys } from '@/db/schema';
import { clientIp, hit } from './rate-limit';

/**
 * กุญแจ API — how another system proves itself to /api/public/v1/*.
 *
 * A key is `trk_` + 32 random bytes. Only its SHA-256 is stored: a plain hash
 * is enough for a secret with that much entropy (there is nothing to guess, so
 * nothing for a slow hash to slow down), and it lets the lookup be an index
 * hit rather than a scan of every key.
 */

const KEY_PREFIX = 'trk_';
/** how much of the key the กุญแจ API page shows — enough to tell two apart */
const SHOWN = 12;

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** A fresh key, and what to store for it. The key itself is never stored. */
export function newKey(): { key: string; prefix: string; keyHash: string } {
  const key = KEY_PREFIX + randomBytes(32).toString('base64url');
  return { key, prefix: key.slice(0, SHOWN), keyHash: hashKey(key) };
}

export interface ApiKeyRow {
  id: number;
  name: string;
}

/** Every key, newest first — the live ones and the revoked ones. */
export async function listApiKeys() {
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      createdByName: apiKeys.createdByName,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
      revokedByName: apiKeys.revokedByName,
    })
    .from(apiKeys)
    .orderBy(desc(apiKeys.createdAt));
}

/**
 * The key a request carries, or the response to send instead.
 *
 * `X-API-Key: trk_…` — the same header the SchoolOS services use, so whoever
 * wires the other system up has one convention to follow. Two buckets: wrong
 * keys are counted per address, so guessing is slow, and a right key per key,
 * so one runaway client cannot hold the app up for everybody.
 */
export async function requireApiKey(
  req: Request,
): Promise<{ key: ApiKeyRow; response?: never } | { key?: never; response: NextResponse }> {
  const presented = req.headers.get('x-api-key')?.trim();
  if (!presented || !presented.startsWith(KEY_PREFIX)) return { response: unauthorized(req) };

  const [row] = await db
    .select({ id: apiKeys.id, name: apiKeys.name })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hashKey(presented)), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (!row) return { response: unauthorized(req) };

  const limit = hit(`api-key:${row.id}`, 300, 60_000);
  if (!limit.ok) return { response: apiError(429, 'rate_limited', 'เรียกถี่เกินไป — รอสักครู่แล้วลองใหม่', limit.retryAfter) };

  // Best-effort, like the activity log: "ใช้ล่าสุด" is a convenience on the
  // ผู้ดูแล's screen, never a reason to fail the call.
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id))
    .catch((e) => console.warn('[api-keys] lastUsedAt failed:', e instanceof Error ? e.message : e));

  return { key: row };
}

function unauthorized(req: Request): NextResponse {
  const limit = hit(`api-key-miss:${clientIp(req.headers)}`, 30, 60_000);
  if (!limit.ok) return apiError(429, 'rate_limited', 'ลองกุญแจผิดถี่เกินไป — รอสักครู่', limit.retryAfter);
  return apiError(401, 'unauthorized', 'ไม่มีกุญแจ API หรือกุญแจถูกยกเลิกแล้ว — ส่งใน header X-API-Key');
}

/** Every error this API returns has the same shape: a code to branch on, and Thai to show. */
export function apiError(status: number, error: string, message: string, retryAfter?: number): NextResponse {
  return NextResponse.json(
    { error, message },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}),
      },
    },
  );
}
