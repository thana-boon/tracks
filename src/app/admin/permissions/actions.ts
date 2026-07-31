'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { adminGrants, people } from '@/db/schema';
import { actorOf, requireRole } from '@/lib/authz';
import { isSchoolOsAdmin } from '@/lib/admin-grants';
import { logActivity } from '@/lib/log';
import type { ActionResult } from '@/components/action-button';

/**
 * Granting and revoking admin *inside this app only*.
 *
 * Both actions touch exactly one table (`admin_grants`) and never the Users
 * Service — a teacher who is `teacher-admin` upstream keeps their admin no
 * matter what happens here, which is why revoking one of them is refused rather
 * than silently doing nothing.
 */

function refresh() {
  revalidatePath('/admin/permissions');
  revalidatePath('/admin');
}

export async function grantAdminAction(personId: number, note: string): Promise<ActionResult> {
  const user = await requireRole('admin');
  if (!Number.isInteger(personId) || personId <= 0)
    return { ok: false, message: 'เลือกครูก่อน' };

  const [person] = await db
    .select({
      id: people.id,
      fullName: people.fullName,
      type: people.type,
      schoolosRole: people.schoolosRole,
      status: people.status,
    })
    .from(people)
    .where(and(eq(people.id, personId), eq(people.type, 'teacher')))
    .limit(1);
  if (!person) return { ok: false, message: 'ไม่พบครูคนนี้ — ลองซิงก์รายชื่อครูก่อน' };
  if (isSchoolOsAdmin(person.schoolosRole))
    return {
      ok: false,
      message: `${person.fullName} เป็นผู้ดูแลจากระบบผู้ใช้ (SchoolOS) อยู่แล้ว — ไม่ต้องเพิ่มที่นี่`,
    };

  const trimmed = note.trim().slice(0, 200);
  try {
    await db.insert(adminGrants).values({
      personId,
      note: trimmed || null,
      grantedBy: actorOf(user),
      grantedByName: user.name,
    });
  } catch {
    // The unique index is the guard against a double submit.
    return { ok: false, message: `${person.fullName} มีสิทธิ์ผู้ดูแลอยู่แล้ว` };
  }

  await logActivity(user, 'grant_admin', `person:${personId}`, {
    name: person.fullName,
    note: trimmed || null,
  });
  refresh();
  return { ok: true, message: `ให้สิทธิ์ผู้ดูแลแก่ ${person.fullName} แล้ว` };
}

export async function revokeAdminAction(personId: number): Promise<ActionResult> {
  const user = await requireRole('admin');

  // Removing your own admin would lock you out of this very screen.
  if (user.personId === personId)
    return { ok: false, message: 'ถอนสิทธิ์ของตัวเองไม่ได้ — ให้ผู้ดูแลคนอื่นถอนให้' };

  const [row] = await db
    .select({ fullName: people.fullName })
    .from(adminGrants)
    .innerJoin(people, eq(adminGrants.personId, people.id))
    .where(eq(adminGrants.personId, personId))
    .limit(1);
  if (!row) return { ok: false, message: 'ไม่พบสิทธิ์ที่จะถอน' };

  await db.delete(adminGrants).where(eq(adminGrants.personId, personId));
  await logActivity(user, 'revoke_admin', `person:${personId}`, { name: row.fullName });
  refresh();
  return { ok: true, message: `ถอนสิทธิ์ผู้ดูแลของ ${row.fullName} แล้ว` };
}
