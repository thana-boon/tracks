'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { attendance, people, registrations } from '@/db/schema';
import { requireRole } from '@/lib/authz';
import { actorOf } from '@/lib/authz';
import { activeYear } from '@/lib/years';
import { logActivity } from '@/lib/log';
import { normalizeYmd } from '@/lib/utils';
import type { ActionResult } from '@/components/action-button';

const SaveInput = z.object({
  subjectId: z.number().int().positive(),
  date: z.string(),
  slot: z.enum(['morning', 'afternoon']),
  records: z.array(z.object({ studentId: z.number().int().positive(), present: z.boolean() })),
});

/** Assigned students of a subject with their presence for one date+slot. */
export interface RosterEntry {
  studentId: number;
  code: string;
  fullName: string;
  nickname: string | null;
  gradeLevel: string | null;
  classroom: string | null;
  /** null = not yet recorded for this slot */
  present: boolean | null;
}

export async function loadRoster(
  subjectId: number,
  date: string,
  slot: 'morning' | 'afternoon',
): Promise<{ ok: boolean; message?: string; roster: RosterEntry[] }> {
  await requireRole('admin', 'teacher');
  const year = await activeYear();
  if (!year) return { ok: false, message: 'ยังไม่ได้ซิงก์ปีการศึกษา', roster: [] };
  const ymd = normalizeYmd(date);
  if (!ymd) return { ok: false, message: 'วันที่ไม่ถูกต้อง', roster: [] };

  const students = await db
    .select({
      studentId: people.id,
      code: people.code,
      fullName: people.fullName,
      nickname: people.nickname,
      gradeLevel: people.gradeLevel,
      classroom: people.classroom,
      classNumber: people.classNumber,
    })
    .from(registrations)
    .innerJoin(people, eq(registrations.studentId, people.id))
    .where(
      and(
        eq(registrations.subjectId, subjectId),
        eq(registrations.yearId, year.id),
        isNull(registrations.droppedAt),
      ),
    )
    .orderBy(people.gradeLevel, people.classroom, people.classNumber, people.code);

  const existing = await db
    .select({ studentId: attendance.studentId, present: attendance.present })
    .from(attendance)
    .where(
      and(
        eq(attendance.subjectId, subjectId),
        eq(attendance.yearId, year.id),
        eq(attendance.date, ymd),
        eq(attendance.slot, slot),
      ),
    );
  const presenceBy = new Map(existing.map((e) => [e.studentId, e.present]));

  const roster: RosterEntry[] = students.map((s) => ({
    studentId: s.studentId,
    code: s.code,
    fullName: s.fullName,
    nickname: s.nickname,
    gradeLevel: s.gradeLevel,
    classroom: s.classroom,
    present: presenceBy.has(s.studentId) ? presenceBy.get(s.studentId)! : null,
  }));
  return { ok: true, roster };
}

/** Upsert attendance for one subject/date/slot. Overwrites prior records. */
export async function saveAttendance(input: z.infer<typeof SaveInput>): Promise<ActionResult> {
  const user = await requireRole('admin', 'teacher');
  const parsed = SaveInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'ข้อมูลไม่ถูกต้อง' };
  const year = await activeYear();
  if (!year) return { ok: false, message: 'ยังไม่ได้ซิงก์ปีการศึกษา' };
  const ymd = normalizeYmd(parsed.data.date);
  if (!ymd) return { ok: false, message: 'วันที่ไม่ถูกต้อง' };

  const { subjectId, slot, records } = parsed.data;
  if (records.length === 0) return { ok: false, message: 'ยังไม่มีนักเรียนให้บันทึก' };

  const actor = actorOf(user);
  await db.transaction(async (tx) => {
    for (const r of records) {
      await tx
        .insert(attendance)
        .values({
          yearId: year.id,
          subjectId,
          studentId: r.studentId,
          date: ymd,
          slot,
          present: r.present,
          recordedBy: actor,
        })
        .onConflictDoUpdate({
          target: [attendance.subjectId, attendance.date, attendance.slot, attendance.studentId],
          set: { present: r.present, recordedBy: actor, recordedAt: new Date() },
        });
    }
  });

  const presentCount = records.filter((r) => r.present).length;
  await logActivity(user, 'save_attendance', `subject:${subjectId}`, {
    date: ymd,
    slot,
    present: presentCount,
    total: records.length,
  });
  revalidatePath('/attendance');
  revalidatePath('/attendance/view');
  return {
    ok: true,
    message: `บันทึกเช็คชื่อแล้ว: มา ${presentCount}/${records.length} คน`,
  };
}
