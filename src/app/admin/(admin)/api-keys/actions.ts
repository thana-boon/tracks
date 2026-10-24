'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { apiKeys } from '@/db/schema';
import { actorOf, requireRole } from '@/lib/authz';
import { newKey } from '@/lib/api-keys';
import { logActivity } from '@/lib/log';
import type { ActionResult } from '@/components/action-button';

/**
 * Issue a key. The key comes back in the result exactly once — after this the
 * only copy is whatever the ผู้ดูแล pasted into the other system.
 */
export async function createApiKeyAction(name: string): Promise<ActionResult & { key?: string }> {
  const user = await requireRole('admin');
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) return { ok: false, message: 'ตั้งชื่อระบบที่จะใช้กุญแจนี้ก่อน' };

  const { key, prefix, keyHash } = newKey();
  const [row] = await db
    .insert(apiKeys)
    .values({ name: trimmed, prefix, keyHash, createdBy: actorOf(user), createdByName: user.name })
    .returning({ id: apiKeys.id });

  await logActivity(user, 'create_api_key', `api_key:${row.id}`, { name: trimmed, prefix });
  revalidatePath('/admin/api-keys');
  return { ok: true, message: `ออกกุญแจให้ ${trimmed} แล้ว`, key };
}

/** Stop a key working, from the next request on. Kept as a row so its history still reads. */
export async function revokeApiKeyAction(id: number): Promise<ActionResult> {
  const user = await requireRole('admin');
  const [row] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date(), revokedByName: user.name })
    .where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt)))
    .returning({ name: apiKeys.name });
  if (!row) return { ok: false, message: 'ไม่พบกุญแจนี้ หรือถูกยกเลิกไปแล้ว' };

  await logActivity(user, 'revoke_api_key', `api_key:${id}`, { name: row.name });
  revalidatePath('/admin/api-keys');
  return { ok: true, message: `ยกเลิกกุญแจของ ${row.name} แล้ว` };
}
