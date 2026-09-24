'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { classrooms, classroomStudents, people } from '@/db/schema';
import { requireRole } from '@/lib/authz';
import { activeYear } from '@/lib/years';
import { logActivity } from '@/lib/log';
import type { ActionResult } from '@/components/action-button';

const NameInput = z.object({
  name: z.string().trim().min(1, 'กรอกชื่อห้อง').max(120),
  note: z.string().trim().max(300).optional().default(''),
});

export async function saveClassroom(
  id: number | null,
  form: { name: string; note: string },
): Promise<ActionResult> {
  const user = await requireRole('admin');
  const year = await activeYear();
  if (!year) return { ok: false, message: 'ยังไม่ได้ซิงก์ปีการศึกษา' };
  const parsed = NameInput.safeParse(form);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' };
  const { name, note } = parsed.data;

  const clash = await db
    .select({ id: classrooms.id })
    .from(classrooms)
    .where(
      id
        ? and(eq(classrooms.yearId, year.id), eq(classrooms.name, name), ne(classrooms.id, id))
        : and(eq(classrooms.yearId, year.id), eq(classrooms.name, name)),
    )
    .limit(1);
  if (clash.length) return { ok: false, message: `มีห้อง “${name}” อยู่แล้วในปีนี้` };

  if (id) {
    await db.update(classrooms).set({ name, note: note || null }).where(eq(classrooms.id, id));
    await logActivity(user, 'update_classroom', name);
    revalidatePath('/admin/classrooms');
    return { ok: true, message: `แก้ไขห้อง “${name}” แล้ว` };
  }
  await db.insert(classrooms).values({ yearId: year.id, name, note: note || null });
  await logActivity(user, 'create_classroom', name);
  revalidatePath('/admin/classrooms');
  return { ok: true, message: `เพิ่มห้อง “${name}” แล้ว` };
}

export async function deleteClassroom(id: number): Promise<ActionResult> {
  const user = await requireRole('admin');
  await db.delete(classrooms).where(eq(classrooms.id, id));
  await logActivity(user, 'delete_classroom', `classroom:${id}`);
  revalidatePath('/admin/classrooms');
  return { ok: true, message: 'ลบห้องแล้ว' };
}

/** Replace a room's member list wholesale with the given student ids. */
export async function setClassroomMembers(
  classroomId: number,
  studentIds: number[],
): Promise<ActionResult> {
  const user = await requireRole('admin');
  const ids = [...new Set(studentIds.filter((n) => Number.isInteger(n) && n > 0))];

  // Guard: only real students may be added.
  if (ids.length) {
    const valid = await db
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.type, 'student'), inArray(people.id, ids)));
    if (valid.length !== ids.length)
      return { ok: false, message: 'มีนักเรียนบางรายการไม่ถูกต้อง' };
  }

  await db.transaction(async (tx) => {
    await tx.delete(classroomStudents).where(eq(classroomStudents.classroomId, classroomId));
    if (ids.length)
      await tx.insert(classroomStudents).values(ids.map((studentId) => ({ classroomId, studentId })));
  });
  await logActivity(user, 'set_classroom_members', `classroom:${classroomId}`, { count: ids.length });
  revalidatePath('/admin/classrooms');
  return { ok: true, message: `บันทึกสมาชิกห้องแล้ว (${ids.length} คน)` };
}
