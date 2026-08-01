'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { attendance, subjectDates, subjectSections } from '@/db/schema';
import { requireRole } from '@/lib/authz';
import { actorOf } from '@/lib/authz';
import { activeYear } from '@/lib/years';
import { logActivity } from '@/lib/log';
import { normalizeYmd } from '@/lib/utils';
import { dayRoster, type DayRosterEntry } from '@/lib/data';
import { sectionsOnDate, type SectionOnDay } from '@/lib/subjects-for-user';
import type { ActionResult } from '@/components/action-button';

const SlotRecords = z
  .array(z.object({ studentId: z.number().int().positive(), present: z.boolean() }))
  .nullable();

const SaveInput = z.object({
  sectionId: z.number().int().positive(),
  date: z.string(),
  /** null = this slot was not checked; it stays unrecorded */
  morning: SlotRecords,
  afternoon: SlotRecords,
});

const ClearInput = z.object({
  sectionId: z.number().int().positive(),
  date: z.string(),
  /** omitted = clear both slots of that day */
  slot: z.enum(['morning', 'afternoon']).optional(),
});

/** The รอบเรียน meeting on one date — step 2 of the check-in flow. */
export async function loadSectionsOnDate(
  date: string,
): Promise<{ ok: boolean; message?: string; sections: SectionOnDay[] }> {
  await requireRole('admin', 'teacher');
  const year = await activeYear();
  if (!year) return { ok: false, message: 'ยังไม่ได้ซิงก์ปีการศึกษา', sections: [] };
  const ymd = normalizeYmd(date);
  if (!ymd) return { ok: false, message: 'วันที่ไม่ถูกต้อง', sections: [] };
  return { ok: true, sections: await sectionsOnDate(year, ymd) };
}

/** The roster for one section on one class day, both slots at once. */
export async function loadDayRoster(
  sectionId: number,
  date: string,
): Promise<{ ok: boolean; message?: string; roster: DayRosterEntry[] }> {
  await requireRole('admin', 'teacher');
  const year = await activeYear();
  if (!year) return { ok: false, message: 'ยังไม่ได้ซิงก์ปีการศึกษา', roster: [] };
  const ymd = normalizeYmd(date);
  if (!ymd) return { ok: false, message: 'วันที่ไม่ถูกต้อง', roster: [] };

  return { ok: true, roster: await dayRoster(sectionId, ymd) };
}

/**
 * Upsert one class day's attendance — morning, afternoon, or both in a single
 * write. A slot passed as null is left alone, so saving the morning does not
 * wipe an afternoon recorded earlier (or vice versa).
 */
export async function saveDayAttendance(
  input: z.infer<typeof SaveInput>,
): Promise<ActionResult> {
  const user = await requireRole('admin', 'teacher');
  const parsed = SaveInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'ข้อมูลไม่ถูกต้อง' };
  const year = await activeYear();
  if (!year) return { ok: false, message: 'ยังไม่ได้ซิงก์ปีการศึกษา' };
  const ymd = normalizeYmd(parsed.data.date);
  if (!ymd) return { ok: false, message: 'วันที่ไม่ถูกต้อง' };

  const { sectionId, morning, afternoon } = parsed.data;
  if (!morning && !afternoon) return { ok: false, message: 'ยังไม่ได้เช็คช่วงใดเลย' };
  if (morning?.length === 0 || afternoon?.length === 0)
    return { ok: false, message: 'ยังไม่มีนักเรียนให้บันทึก' };

  // The date must be one this section actually meets on — the check-in screen
  // only offers scheduled days, so anything else is a stale or forged submit.
  const [scheduled] = await db
    .select({ subjectId: subjectSections.subjectId })
    .from(subjectDates)
    .innerJoin(subjectSections, eq(subjectDates.sectionId, subjectSections.id))
    .where(
      and(
        eq(subjectDates.sectionId, sectionId),
        eq(subjectDates.date, ymd),
        eq(subjectSections.yearId, year.id),
      ),
    )
    .limit(1);
  if (!scheduled) return { ok: false, message: 'กลุ่มนี้ไม่ได้เรียนในวันที่เลือก' };

  const actor = actorOf(user);
  const slots: ['morning' | 'afternoon', { studentId: number; present: boolean }[]][] = [];
  if (morning) slots.push(['morning', morning]);
  if (afternoon) slots.push(['afternoon', afternoon]);

  await db.transaction(async (tx) => {
    for (const [slot, records] of slots) {
      for (const r of records) {
        await tx
          .insert(attendance)
          .values({
            yearId: year.id,
            subjectId: scheduled.subjectId,
            sectionId,
            studentId: r.studentId,
            date: ymd,
            slot,
            present: r.present,
            recordedBy: actor,
          })
          .onConflictDoUpdate({
            target: [attendance.sectionId, attendance.date, attendance.slot, attendance.studentId],
            set: { present: r.present, recordedBy: actor, recordedAt: new Date() },
          });
      }
    }
  });

  const parts = slots.map(
    ([slot, records]) =>
      `${slot === 'morning' ? 'เช้า' : 'บ่าย'} ${records.filter((r) => r.present).length}/${records.length}`,
  );
  await logActivity(user, 'save_attendance', `section:${sectionId}`, {
    date: ymd,
    slots: slots.map(([slot]) => slot),
    total: slots[0]?.[1].length ?? 0,
  });
  revalidatePath('/attendance');
  revalidatePath('/attendance/view');
  return { ok: true, message: `บันทึกเช็คชื่อแล้ว — มา ${parts.join(' · ')} คน` };
}

/**
 * Erase a recorded check-in — one slot, or the whole day.
 *
 * A wrong press cannot be undone by saving over it: มา and ไม่มา are the only
 * two values the roster can express, so a slot checked by mistake stays checked
 * forever. Deleting the rows puts the day back to ยังไม่เช็ค, which is what a
 * teacher who picked the wrong กลุ่ม actually wants — and it is the same thing
 * ผลเช็คชื่อ reads, so the day stops counting towards ผ่าน/ไม่ผ่าน too.
 */
export async function clearDayAttendance(
  input: z.infer<typeof ClearInput>,
): Promise<ActionResult> {
  const user = await requireRole('admin', 'teacher');
  const parsed = ClearInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'ข้อมูลไม่ถูกต้อง' };
  const year = await activeYear();
  if (!year) return { ok: false, message: 'ยังไม่ได้ซิงก์ปีการศึกษา' };
  const ymd = normalizeYmd(parsed.data.date);
  if (!ymd) return { ok: false, message: 'วันที่ไม่ถูกต้อง' };

  const { sectionId, slot } = parsed.data;

  // Same guard as saving: the section has to be one of this year's.
  const [section] = await db
    .select({ id: subjectSections.id })
    .from(subjectSections)
    .where(and(eq(subjectSections.id, sectionId), eq(subjectSections.yearId, year.id)))
    .limit(1);
  if (!section) return { ok: false, message: 'ไม่พบกลุ่มเรียนในปีการศึกษานี้' };

  const removed = await db
    .delete(attendance)
    .where(
      and(
        eq(attendance.sectionId, sectionId),
        eq(attendance.date, ymd),
        slot ? eq(attendance.slot, slot) : undefined,
      ),
    )
    .returning({ id: attendance.id });

  await logActivity(user, 'clear_attendance', `section:${sectionId}`, {
    date: ymd,
    slot: slot ?? 'both',
    removed: removed.length,
  });
  revalidatePath('/attendance');
  revalidatePath('/attendance/view');

  const what = slot ? `ช่วง${slot === 'morning' ? 'เช้า' : 'บ่าย'}` : 'ทั้งวัน';
  if (removed.length === 0)
    return { ok: true, message: `${what}ยังไม่มีการเช็คชื่อที่บันทึกไว้` };
  return { ok: true, message: `ล้างการเช็คชื่อ${what}แล้ว — ลบ ${removed.length} รายการ` };
}
