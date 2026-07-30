'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { trackGroups, trackSubjects } from '@/db/schema';
import { requireRole } from '@/lib/authz';
import { logActivity } from '@/lib/log';
import type { ActionResult } from '@/components/action-button';

const GroupInput = z.object({
  code: z.string().trim().min(1, 'กรอกรหัสกลุ่ม').max(20),
  name: z.string().trim().min(1, 'กรอกชื่อกลุ่ม').max(120),
  description: z.string().trim().max(500).optional().default(''),
});

export async function saveGroup(
  id: number | null,
  form: { code: string; name: string; description: string },
): Promise<ActionResult> {
  const user = await requireRole('admin');
  const parsed = GroupInput.safeParse(form);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' };
  const { code, name, description } = parsed.data;

  // Unique code guard (excluding self on edit).
  const clash = await db
    .select({ id: trackGroups.id })
    .from(trackGroups)
    .where(id ? and(eq(trackGroups.code, code), ne(trackGroups.id, id)) : eq(trackGroups.code, code))
    .limit(1);
  if (clash.length) return { ok: false, message: `รหัสกลุ่ม “${code}” ถูกใช้แล้ว` };

  if (id) {
    await db
      .update(trackGroups)
      .set({ code, name, description: description || null })
      .where(eq(trackGroups.id, id));
    await logActivity(user, 'update_group', code);
    revalidatePath('/admin/groups');
    return { ok: true, message: `แก้ไขกลุ่ม “${name}” แล้ว` };
  }

  await db.insert(trackGroups).values({ code, name, description: description || null });
  await logActivity(user, 'create_group', code);
  revalidatePath('/admin/groups');
  return { ok: true, message: `เพิ่มกลุ่ม “${name}” แล้ว` };
}

export async function toggleGroup(id: number, active: boolean): Promise<ActionResult> {
  const user = await requireRole('admin');
  await db.update(trackGroups).set({ active }).where(eq(trackGroups.id, id));
  await logActivity(user, active ? 'enable_group' : 'disable_group', `group:${id}`);
  revalidatePath('/admin/groups');
  return { ok: true, message: active ? 'เปิดใช้งานกลุ่มแล้ว' : 'ปิดใช้งานกลุ่มแล้ว' };
}

export async function deleteGroup(id: number): Promise<ActionResult> {
  const user = await requireRole('admin');
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(trackSubjects)
    .where(eq(trackSubjects.groupId, id));
  if (Number(n) > 0)
    return {
      ok: false,
      message: `ลบไม่ได้: กลุ่มนี้มีวิชาอยู่ ${n} วิชา — ย้ายหรือลบวิชาก่อน หรือปิดใช้งานแทน`,
    };
  await db.delete(trackGroups).where(eq(trackGroups.id, id));
  await logActivity(user, 'delete_group', `group:${id}`);
  revalidatePath('/admin/groups');
  return { ok: true, message: 'ลบกลุ่มแล้ว' };
}
