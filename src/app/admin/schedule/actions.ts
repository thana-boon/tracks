'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { subjectDates, subjectSections, trackSubjects } from '@/db/schema';
import { requireRole } from '@/lib/authz';
import { activeYear } from '@/lib/years';
import { dayIsChecked } from '@/lib/schedule';
import { deriveSectionName } from '@/lib/section-name';
import { logActivity } from '@/lib/log';
import { normalizeYmd, thaiDateLong } from '@/lib/utils';
import type { ActionResult } from '@/components/action-button';

/**
 * ตารางเรียนทั้งปี writes the same `subject_dates` rows the จัดนักเรียนเข้าวิชา
 * screen writes — a class day added here *is* a class day of that รอบเรียน, and
 * both screens (plus เช็คชื่อ) are re-rendered after every write so neither can
 * show a schedule the other has already changed.
 */
function revalidateSchedule() {
  revalidatePath('/admin/schedule');
  revalidatePath('/admin/register');
  revalidatePath('/attendance');
}

const AddInput = z.object({
  subjectId: z.number().int().positive(),
  /** an existing รอบเรียน of that วิชา, or null to open a new one */
  sectionId: z.number().int().positive().nullable(),
  /** only read when sectionId is null — blank lets the usual naming rule pick */
  newSectionName: z.string().trim().max(120).optional().default(''),
  room: z.string().trim().max(120).optional().default(''),
  dates: z.array(z.string()).min(1, 'เลือกวันที่อย่างน้อย 1 วัน'),
});

export interface AddDaysResult extends ActionResult {
  sectionId?: number;
}

/**
 * Put one or more days on the calendar of a รอบเรียน — the three fields of this
 * screen (วัน, วิชา, กลุ่ม) in one press.
 *
 * The กลุ่ม may be one that already exists or a new one opened on the spot: a
 * long-term timetable is usually drawn *before* anybody is placed in it, so
 * insisting on an existing รอบ would mean visiting the other screen first for
 * every line. A รอบ opened here starts with no นักเรียน and shows up on
 * จัดนักเรียนเข้าวิชา as "ยังไม่ครบ" until someone fills it in there.
 *
 * Days already on the calendar are left alone rather than refused: re-adding a
 * whole term to catch two new dates is the normal way this gets used.
 */
export async function addClassDays(input: z.infer<typeof AddInput>): Promise<AddDaysResult> {
  const user = await requireRole('admin');
  const parsed = AddInput.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' };
  const year = await activeYear();
  if (!year) return { ok: false, message: 'ยังไม่ได้ซิงก์ปีการศึกษา' };

  const { subjectId, sectionId, newSectionName, room, dates } = parsed.data;

  const [subject] = await db
    .select({ id: trackSubjects.id, code: trackSubjects.code, active: trackSubjects.active })
    .from(trackSubjects)
    .where(eq(trackSubjects.id, subjectId))
    .limit(1);
  if (!subject) return { ok: false, message: 'ไม่พบวิชานี้' };
  if (!subject.active) return { ok: false, message: `วิชา ${subject.code} ถูกปิดใช้งานอยู่` };

  const clean = [...new Set(dates.map(normalizeYmd).filter(Boolean) as string[])].sort();
  if (clean.length !== dates.length) return { ok: false, message: 'วันที่ไม่ถูกต้อง' };

  let id = sectionId;
  let opened = false;
  let label = '';

  if (id) {
    const [section] = await db
      .select({ id: subjectSections.id, name: subjectSections.name })
      .from(subjectSections)
      .where(
        and(
          eq(subjectSections.id, id),
          eq(subjectSections.subjectId, subjectId),
          eq(subjectSections.yearId, year.id),
        ),
      )
      .limit(1);
    if (!section) return { ok: false, message: 'ไม่พบกลุ่มเรียนนี้ในวิชาที่เลือก' };
    label = section.name;
  } else {
    label = newSectionName || (await deriveSectionName(year.id, subjectId, new Set(), clean, null));
    // A รอบ named by hand still has to be unique within its วิชา, or two รอบ
    // would be indistinguishable in every list on every screen.
    if (newSectionName) {
      const clash = await db
        .select({ id: subjectSections.id })
        .from(subjectSections)
        .where(
          and(
            eq(subjectSections.subjectId, subjectId),
            eq(subjectSections.yearId, year.id),
            eq(subjectSections.name, label),
          ),
        )
        .limit(1);
      if (clash.length)
        return { ok: false, message: `วิชา ${subject.code} มีกลุ่มชื่อ “${label}” อยู่แล้ว` };
    }
    const [created] = await db
      .insert(subjectSections)
      .values({ subjectId, yearId: year.id, name: label, room: room || null })
      .returning({ id: subjectSections.id });
    id = created.id;
    opened = true;
  }

  const sid = id;
  const existing = await db
    .select({ date: subjectDates.date })
    .from(subjectDates)
    .where(and(eq(subjectDates.sectionId, sid), inArray(subjectDates.date, clean)));
  const already = new Set(existing.map((r) => r.date));
  const toAdd = clean.filter((d) => !already.has(d));

  if (toAdd.length)
    await db
      .insert(subjectDates)
      .values(toAdd.map((date) => ({ sectionId: sid, date })))
      .onConflictDoNothing();

  await logActivity(user, 'add_class_dates', `section:${sid}`, {
    subject: subject.code,
    section: label,
    added: toAdd.length,
    skipped: clean.length - toAdd.length,
    openedSection: opened,
  });
  revalidateSchedule();

  const parts: string[] = [];
  if (opened) parts.push(`เปิดกลุ่ม “${label}”`);
  parts.push(toAdd.length ? `เพิ่มวันเรียน ${toAdd.length} วัน` : 'ไม่มีวันใหม่');
  if (clean.length - toAdd.length > 0) parts.push(`มีอยู่แล้ว ${clean.length - toAdd.length} วัน`);
  return { ok: true, message: `${subject.code} · ${parts.join(' · ')}`, sectionId: sid };
}

const DayInput = z.object({
  sectionId: z.number().int().positive(),
  date: z.string(),
});

/**
 * Take one class day off a รอบเรียน.
 *
 * Refused once that day has been checked in: its attendance rows would be left
 * outside the schedule, which is what เวลาเข้าเรียน is computed against, so
 * everyone's result would move without anybody asking for it. The same rule the
 * จัดนักเรียนเข้าวิชา editor applies when it silently keeps a checked day — said
 * out loud here, because on this screen the day *is* the row being pressed.
 */
export async function removeClassDay(input: z.infer<typeof DayInput>): Promise<ActionResult> {
  const user = await requireRole('admin');
  const parsed = DayInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'ข้อมูลไม่ถูกต้อง' };
  const date = normalizeYmd(parsed.data.date);
  if (!date) return { ok: false, message: 'วันที่ไม่ถูกต้อง' };
  const { sectionId } = parsed.data;

  const section = await sectionInActiveYear(sectionId);
  if (!section) return { ok: false, message: 'ไม่พบกลุ่มเรียนนี้ในปีการศึกษาปัจจุบัน' };

  if (await dayIsChecked(sectionId, date))
    return {
      ok: false,
      message: `ลบไม่ได้: ${thaiDateLong(date)} เช็คชื่อไปแล้ว — ต้องลบข้อมูลเช็คชื่อของวันนี้ก่อน`,
    };

  const removed = await db
    .delete(subjectDates)
    .where(and(eq(subjectDates.sectionId, sectionId), eq(subjectDates.date, date)))
    .returning({ id: subjectDates.id });
  if (!removed.length) return { ok: false, message: 'ไม่พบวันเรียนนี้แล้ว' };

  await logActivity(user, 'remove_class_date', `section:${sectionId}`, {
    subject: section.subjectCode,
    section: section.name,
    date,
  });
  revalidateSchedule();
  return { ok: true, message: `เอา ${thaiDateLong(date)} ออกจาก “${section.name}” แล้ว` };
}

const MoveInput = z.object({
  sectionId: z.number().int().positive(),
  from: z.string(),
  to: z.string(),
});

/**
 * Move a class day to another date, keeping the รอบเรียน it belongs to.
 *
 * A year's timetable is drawn months ahead and then shifted — a holiday lands
 * on a Tuesday and the whole ช่วง slides a week. Deleting and re-adding does the
 * same thing in two presses, but only while the ผู้ดูแล still remembers which
 * กลุ่ม the line belonged to; moving it in place cannot lose that.
 */
export async function moveClassDay(input: z.infer<typeof MoveInput>): Promise<ActionResult> {
  const user = await requireRole('admin');
  const parsed = MoveInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'ข้อมูลไม่ถูกต้อง' };
  const from = normalizeYmd(parsed.data.from);
  const to = normalizeYmd(parsed.data.to);
  if (!from || !to) return { ok: false, message: 'วันที่ไม่ถูกต้อง' };
  const { sectionId } = parsed.data;
  if (from === to) return { ok: true, message: 'วันเดิม — ไม่มีอะไรเปลี่ยน' };

  const section = await sectionInActiveYear(sectionId);
  if (!section) return { ok: false, message: 'ไม่พบกลุ่มเรียนนี้ในปีการศึกษาปัจจุบัน' };

  if (await dayIsChecked(sectionId, from))
    return {
      ok: false,
      message: `ย้ายไม่ได้: ${thaiDateLong(from)} เช็คชื่อไปแล้ว — ข้อมูลเช็คชื่อจะหลุดออกจากตาราง`,
    };

  const clash = await db
    .select({ id: subjectDates.id })
    .from(subjectDates)
    .where(and(eq(subjectDates.sectionId, sectionId), eq(subjectDates.date, to)))
    .limit(1);
  if (clash.length)
    return { ok: false, message: `“${section.name}” มี ${thaiDateLong(to)} อยู่แล้ว` };

  const moved = await db
    .update(subjectDates)
    .set({ date: to })
    .where(and(eq(subjectDates.sectionId, sectionId), eq(subjectDates.date, from)))
    .returning({ id: subjectDates.id });
  if (!moved.length) return { ok: false, message: 'ไม่พบวันเรียนนี้แล้ว' };

  await logActivity(user, 'move_class_date', `section:${sectionId}`, {
    subject: section.subjectCode,
    section: section.name,
    from,
    to,
  });
  revalidateSchedule();
  return {
    ok: true,
    message: `ย้าย “${section.name}” จาก ${thaiDateLong(from)} เป็น ${thaiDateLong(to)} แล้ว`,
  };
}

/** The รอบเรียน behind a row, only if it belongs to the ปีการศึกษา in use. */
async function sectionInActiveYear(sectionId: number) {
  const year = await activeYear();
  if (!year) return null;
  const [row] = await db
    .select({
      id: subjectSections.id,
      name: subjectSections.name,
      subjectCode: trackSubjects.code,
    })
    .from(subjectSections)
    .innerJoin(trackSubjects, eq(subjectSections.subjectId, trackSubjects.id))
    .where(and(eq(subjectSections.id, sectionId), eq(subjectSections.yearId, year.id)))
    .limit(1);
  return row ?? null;
}
