'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { registrations, trackSubjects } from '@/db/schema';
import { requireRole } from '@/lib/authz';
import { logActivity } from '@/lib/log';
import type { ActionResult } from '@/components/action-button';

const SubjectInput = z.object({
  groupId: z.number().int().positive(),
  code: z.string().trim().min(1, 'กรอกรหัสวิชา').max(30),
  name: z.string().trim().min(1, 'กรอกชื่อวิชา').max(160),
  teacherName: z.string().trim().max(160).optional().default(''),
  description: z.string().trim().max(500).optional().default(''),
});

export async function saveSubject(
  id: number | null,
  form: { groupId: number; code: string; name: string; teacherName: string; description: string },
): Promise<ActionResult> {
  const user = await requireRole('admin');
  const parsed = SubjectInput.safeParse(form);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' };
  const { groupId, code, name, teacherName, description } = parsed.data;

  const clash = await db
    .select({ id: trackSubjects.id })
    .from(trackSubjects)
    .where(id ? and(eq(trackSubjects.code, code), ne(trackSubjects.id, id)) : eq(trackSubjects.code, code))
    .limit(1);
  if (clash.length) return { ok: false, message: `รหัสวิชา “${code}” ถูกใช้แล้ว` };

  const values = {
    groupId,
    code,
    name,
    teacherName: teacherName || null,
    description: description || null,
  };

  if (id) {
    await db.update(trackSubjects).set(values).where(eq(trackSubjects.id, id));
    await logActivity(user, 'update_subject', code);
    revalidatePath('/admin/subjects');
    return { ok: true, message: `แก้ไขวิชา “${name}” แล้ว` };
  }
  await db.insert(trackSubjects).values(values);
  await logActivity(user, 'create_subject', code);
  revalidatePath('/admin/subjects');
  return { ok: true, message: `เพิ่มวิชา “${name}” แล้ว` };
}

export async function toggleSubject(id: number, active: boolean): Promise<ActionResult> {
  const user = await requireRole('admin');
  await db.update(trackSubjects).set({ active }).where(eq(trackSubjects.id, id));
  await logActivity(user, active ? 'enable_subject' : 'disable_subject', `subject:${id}`);
  revalidatePath('/admin/subjects');
  return { ok: true, message: active ? 'เปิดใช้งานวิชาแล้ว' : 'ปิดใช้งานวิชาแล้ว' };
}

export async function deleteSubject(id: number): Promise<ActionResult> {
  const user = await requireRole('admin');
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(registrations)
    .where(eq(registrations.subjectId, id));
  if (Number(n) > 0)
    return {
      ok: false,
      message: `ลบไม่ได้: วิชานี้เคยมีการจัดนักเรียน ${n} รายการ — ใช้ปิดใช้งานแทนเพื่อคงประวัติ`,
    };
  await db.delete(trackSubjects).where(eq(trackSubjects.id, id));
  await logActivity(user, 'delete_subject', `subject:${id}`);
  revalidatePath('/admin/subjects');
  return { ok: true, message: 'ลบวิชาแล้ว' };
}
