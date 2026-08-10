import 'server-only';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  attendance,
  registrations,
  subjectDates,
  subjectSections,
  trackGroups,
  trackSubjects,
} from '@/db/schema';
import { byClassOrder } from './utils';
import type { YearRow } from './years';

/** One date classes are held on, with how many รอบเรียน meet that day. */
export interface ClassDay {
  /** "YYYY-MM-DD" */
  date: string;
  sectionCount: number;
}

/**
 * Every date some section is scheduled for in a year, ascending. The check-in
 * screen starts here: a teacher picks the day first, and only days that have
 * classes on them are offered.
 */
export async function classDaysOfYear(year: YearRow): Promise<ClassDay[]> {
  const rows = await db
    .select({ date: subjectDates.date, n: sql<number>`count(*)` })
    .from(subjectDates)
    .innerJoin(subjectSections, eq(subjectDates.sectionId, subjectSections.id))
    .innerJoin(trackSubjects, eq(subjectSections.subjectId, trackSubjects.id))
    .where(and(eq(subjectSections.yearId, year.id), eq(trackSubjects.active, true)))
    .groupBy(subjectDates.date)
    .orderBy(asc(subjectDates.date));
  return rows.map((r) => ({ date: r.date, sectionCount: Number(r.n) }));
}

/**
 * One class day seen from above: how many รอบเรียน meet, and how far their
 * check-in has got. The ผลเช็คชื่อ screen starts here — an admin picks the day
 * before drilling into any one กลุ่ม.
 */
export interface AttendanceDay {
  /** "YYYY-MM-DD" */
  date: string;
  sectionCount: number;
  /** sections with both slots recorded */
  doneCount: number;
  /** sections with exactly one slot recorded */
  partialCount: number;
}

/** Every class day of a year with its check-in progress, ascending. */
export async function attendanceDaysOfYear(year: YearRow): Promise<AttendanceDay[]> {
  const [scheduled, checked] = await Promise.all([
    db
      .select({ date: subjectDates.date, sectionId: subjectDates.sectionId })
      .from(subjectDates)
      .innerJoin(subjectSections, eq(subjectDates.sectionId, subjectSections.id))
      .innerJoin(trackSubjects, eq(subjectSections.subjectId, trackSubjects.id))
      .where(and(eq(subjectSections.yearId, year.id), eq(trackSubjects.active, true)))
      .orderBy(asc(subjectDates.date)),
    db
      .select({
        date: attendance.date,
        sectionId: attendance.sectionId,
        slots: sql<number>`count(distinct ${attendance.slot})`,
      })
      .from(attendance)
      .where(eq(attendance.yearId, year.id))
      .groupBy(attendance.date, attendance.sectionId),
  ]);

  const slotsBy = new Map(checked.map((c) => [`${c.date}:${c.sectionId}`, Number(c.slots)]));
  const days = new Map<string, AttendanceDay>();
  for (const s of scheduled) {
    const day =
      days.get(s.date) ?? { date: s.date, sectionCount: 0, doneCount: 0, partialCount: 0 };
    day.sectionCount += 1;
    const slots = slotsBy.get(`${s.date}:${s.sectionId}`) ?? 0;
    if (slots >= 2) day.doneCount += 1;
    else if (slots === 1) day.partialCount += 1;
    days.set(s.date, day);
  }
  return [...days.values()];
}

/** A รอบเรียน meeting on a given date, as the check-in list shows it. */
export interface SectionOnDay {
  id: number;
  name: string;
  room: string | null;
  subjectCode: string;
  subjectName: string;
  groupCode: string;
  groupName: string;
  teacherName: string | null;
  studentCount: number;
  /** slots already recorded for this date — drives the “เช็คแล้ว” markers */
  morningChecked: boolean;
  afternoonChecked: boolean;
  /** students marked present in each slot; null when the slot is unrecorded */
  morningPresent: number | null;
  afternoonPresent: number | null;
}

/**
 * Sections that meet on one date, with their room and how far the check-in has
 * got, in ชั้น/กลุ่ม order. Any teacher may take any section's attendance (spec
 * §3), so this is not scoped by teacher — the list is the same for admin and
 * teacher.
 */
export async function sectionsOnDate(year: YearRow, date: string): Promise<SectionOnDay[]> {
  const [sections, counts, checked] = await Promise.all([
    db
      .select({
        id: subjectSections.id,
        name: subjectSections.name,
        room: subjectSections.room,
        subjectCode: trackSubjects.code,
        subjectName: trackSubjects.name,
        teacherName: trackSubjects.teacherName,
        groupCode: trackGroups.code,
        groupName: trackGroups.name,
      })
      .from(subjectDates)
      .innerJoin(subjectSections, eq(subjectDates.sectionId, subjectSections.id))
      .innerJoin(trackSubjects, eq(subjectSections.subjectId, trackSubjects.id))
      .innerJoin(trackGroups, eq(trackSubjects.groupId, trackGroups.id))
      .where(
        and(
          eq(subjectSections.yearId, year.id),
          eq(subjectDates.date, date),
          eq(trackSubjects.active, true),
        ),
      )
      .orderBy(asc(trackGroups.code), asc(trackSubjects.code), asc(subjectSections.name)),
    db
      .select({ sectionId: registrations.sectionId, n: sql<number>`count(*)` })
      .from(registrations)
      .where(and(eq(registrations.yearId, year.id), isNull(registrations.droppedAt)))
      .groupBy(registrations.sectionId),
    db
      .select({
        sectionId: attendance.sectionId,
        slot: attendance.slot,
        present: sql<number>`count(*) filter (where ${attendance.present})`,
      })
      .from(attendance)
      .where(and(eq(attendance.yearId, year.id), eq(attendance.date, date)))
      .groupBy(attendance.sectionId, attendance.slot),
  ]);

  const countBy = new Map(counts.map((c) => [c.sectionId, Number(c.n)]));
  const presentBy = new Map(
    checked.map((c) => [`${c.sectionId}:${c.slot}`, Number(c.present)]),
  );

  // Ordered in JS, not by the query: "ม.4 กลุ่มเรียนที่ 10" has to follow
  // "กลุ่มเรียนที่ 2", which no SQL collation gets right on its own.
  return sections
    .map((s) => ({
      ...s,
      studentCount: countBy.get(s.id) ?? 0,
      morningChecked: presentBy.has(`${s.id}:morning`),
      afternoonChecked: presentBy.has(`${s.id}:afternoon`),
      morningPresent: presentBy.get(`${s.id}:morning`) ?? null,
      afternoonPresent: presentBy.get(`${s.id}:afternoon`) ?? null,
    }))
    .sort(byClassOrder);
}
