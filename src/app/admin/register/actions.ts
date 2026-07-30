'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { people, registrations, subjectDays, trackSubjects } from '@/db/schema';
import { requireRole } from '@/lib/authz';
import { actorOf } from '@/lib/authz';
import { activeYear } from '@/lib/years';
import { logActivity } from '@/lib/log';
import type { ActionResult } from '@/components/action-button';

/** Set a subject's meeting weekdays for the active year (0=Sun…6=Sat). */
export async function saveMeetingDays(
  subjectId: number,
  days: number[],
): Promise<ActionResult> {
  const user = await requireRole('admin');
  const year = await activeYear();
  if (!year) return { ok: false, message: 'ยังไม่ได้ซิงก์ปีการศึกษา' };

  const clean = [...new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  await db.transaction(async (tx) => {
    await tx
      .delete(subjectDays)
      .where(and(eq(subjectDays.subjectId, subjectId), eq(subjectDays.yearId, year.id)));
    if (clean.length)
      await tx
        .insert(subjectDays)
        .values(clean.map((dayOfWeek) => ({ subjectId, yearId: year.id, dayOfWeek })));
  });
  await logActivity(user, 'set_meeting_days', `subject:${subjectId}`, { days: clean });
  revalidatePath('/admin/register');
  return { ok: true, message: 'บันทึกวันเรียนแล้ว' };
}

/**
 * Reconcile a subject's assigned students for the active year against the given
 * set. Append-only history (spec §4.3): additions insert a fresh row, removals
 * stamp droppedAt — nothing is deleted, so a transcript can reconstruct any
 * year. Re-adding a previously dropped student creates a new active row.
 */
export async function setAssignments(
  subjectId: number,
  studentIds: number[],
): Promise<ActionResult> {
  const user = await requireRole('admin');
  const year = await activeYear();
  if (!year) return { ok: false, message: 'ยังไม่ได้ซิงก์ปีการศึกษา' };

  const [subject] = await db
    .select({ id: trackSubjects.id, active: trackSubjects.active })
    .from(trackSubjects)
    .where(eq(trackSubjects.id, subjectId))
    .limit(1);
  if (!subject) return { ok: false, message: 'ไม่พบวิชานี้' };

  const wanted = new Set(studentIds.filter((n) => Number.isInteger(n) && n > 0));

  // Only real ม.4-6 students may be assigned.
  if (wanted.size) {
    const valid = await db
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.type, 'student'), inArray(people.id, [...wanted])));
    if (valid.length !== wanted.size)
      return { ok: false, message: 'มีนักเรียนบางรายการไม่ถูกต้อง' };
  }

  const current = await db
    .select({ studentId: registrations.studentId })
    .from(registrations)
    .where(
      and(
        eq(registrations.subjectId, subjectId),
        eq(registrations.yearId, year.id),
        isNull(registrations.droppedAt),
      ),
    );
  const currentSet = new Set(current.map((r) => r.studentId));

  const toAdd = [...wanted].filter((id) => !currentSet.has(id));
  const toDrop = [...currentSet].filter((id) => !wanted.has(id));

  const actor = actorOf(user);
  await db.transaction(async (tx) => {
    if (toDrop.length)
      await tx
        .update(registrations)
        .set({ droppedAt: new Date(), droppedBy: actor })
        .where(
          and(
            eq(registrations.subjectId, subjectId),
            eq(registrations.yearId, year.id),
            isNull(registrations.droppedAt),
            inArray(registrations.studentId, toDrop),
          ),
        );
    if (toAdd.length)
      await tx.insert(registrations).values(
        toAdd.map((studentId) => ({
          yearId: year.id,
          subjectId,
          studentId,
          assignedBy: actor,
        })),
      );
  });

  await logActivity(user, 'set_assignments', `subject:${subjectId}`, {
    added: toAdd.length,
    dropped: toDrop.length,
    total: wanted.size,
  });
  revalidatePath('/admin/register');
  return {
    ok: true,
    message: `บันทึกแล้ว: เพิ่ม ${toAdd.length}, นำออก ${toDrop.length} (รวม ${wanted.size} คน)`,
  };
}
