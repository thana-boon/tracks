'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { adminGrants, people } from '@/db/schema';
import { actorOf, requireRole } from '@/lib/authz';
import { isGrantRole, isSchoolOsAdmin, type GrantRole } from '@/lib/admin-grants';
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

const ROLE_WORD: Record<GrantRole, string> = {
  admin: 'สิทธิ์ผู้ดูแล',
  moderator: 'สิทธิ์ Moderator',
};

export async function grantAdminAction(
  personId: number,
  note: string,
  role: GrantRole = 'admin',
): Promise<ActionResult> {
  const user = await requireRole('admin');
  if (!Number.isInteger(personId) || personId <= 0)
    return { ok: false, message: 'เลือกครูก่อน' };
  if (!isGrantRole(role)) return { ok: false, message: 'ระดับสิทธิ์ไม่ถูกต้อง' };

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
      role,
      note: trimmed || null,
      grantedBy: actorOf(user),
      grantedByName: user.name,
    });
  } catch {
    // The unique index is the guard against a double submit.
    return {
      ok: false,
      message: `${person.fullName} มีสิทธิ์อยู่แล้ว — ถ้าจะเปลี่ยนระดับ ให้ถอนสิทธิ์เดิมก่อน`,
    };
  }

  await logActivity(user, role === 'admin' ? 'grant_admin' : 'grant_moderator', `person:${personId}`, {
    name: person.fullName,
    note: trimmed || null,
  });
  refresh();
  return { ok: true, message: `ให้${ROLE_WORD[role]}แก่ ${person.fullName} แล้ว` };
}

export async function revokeAdminAction(personId: number): Promise<ActionResult> {
  const user = await requireRole('admin');

  // Removing your own admin would lock you out of this very screen.
  if (user.personId === personId)
    return { ok: false, message: 'ถอนสิทธิ์ของตัวเองไม่ได้ — ให้ผู้ดูแลคนอื่นถอนให้' };

  const [row] = await db
    .select({ fullName: people.fullName, role: adminGrants.role })
    .from(adminGrants)
    .innerJoin(people, eq(adminGrants.personId, people.id))
    .where(eq(adminGrants.personId, personId))
    .limit(1);
  if (!row) return { ok: false, message: 'ไม่พบสิทธิ์ที่จะถอน' };

  await db.delete(adminGrants).where(eq(adminGrants.personId, personId));
  const role: GrantRole = row.role === 'admin' ? 'admin' : 'moderator';
  await logActivity(user, role === 'admin' ? 'revoke_admin' : 'revoke_moderator', `person:${personId}`, {
    name: row.fullName,
  });
  refresh();
  return { ok: true, message: `ถอน${ROLE_WORD[role]}ของ ${row.fullName} แล้ว` };
}
