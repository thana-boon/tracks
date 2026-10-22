import 'server-only';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  attendance,
  scheduleBlockDays,
  scheduleBlockRows,
  scheduleBlocks,
  subjectDates,
  subjectSections,
  trackGroups,
  trackSubjects,
  type ScheduleRowSource,
} from '@/db/schema';

/**
 * One line of the ตารางเรียนทั้งปี: a single class day of a single รอบเรียน.
 *
 * The same rows the จัดนักเรียนเข้าวิชา screen writes when an admin ticks days
 * on the calendar — `subject_dates` is the one schedule this app has, so the
 * two screens are two readings of it rather than two copies. Add a day here and
 * the รอบ has it there; tick a day there and the line appears here.
 */
export interface ScheduleRow {
  /** the day itself, "YYYY-MM-DD" — a (sectionId, date) pair is the row's key */
  date: string;
  sectionId: number;
  sectionName: string;
  room: string | null;
  subjectId: number;
  subjectCode: string;
  subjectName: string;
  teacherName: string | null;
  institution: string | null;
  /** ภาคเรียน/ช่วง the วิชา belongs to — null on a วิชา nobody has placed yet */
  semester: number | null;
  phase: number | null;
  groupId: number;
  groupCode: string;
  groupName: string;
  /** สีของกลุ่ม — a GROUP_COLORS key, or null */
  groupColor: string | null;
}

/**
 * Every class day of a ปีการศึกษา, one row per day per รอบเรียน, in date order.
 *
 * A year is a few hundred rows at most (sixty-nine รอบ × a handful of days), so
 * the whole year is read in one query and filtered in the browser — the screen
 * exists to be scanned and re-filtered, and a round trip per filter change
 * would make that worse, not better.
 */
export async function yearSchedule(yearId: number): Promise<ScheduleRow[]> {
  return db
    .select({
      date: subjectDates.date,
      sectionId: subjectSections.id,
      sectionName: subjectSections.name,
      room: subjectSections.room,
      subjectId: trackSubjects.id,
      subjectCode: trackSubjects.code,
      subjectName: trackSubjects.name,
      teacherName: trackSubjects.teacherName,
      institution: trackSubjects.institution,
      semester: trackSubjects.semester,
      phase: trackSubjects.phase,
      groupId: trackGroups.id,
      groupCode: trackGroups.code,
      groupName: trackGroups.name,
      groupColor: trackGroups.color,
    })
    .from(subjectDates)
    .innerJoin(subjectSections, eq(subjectDates.sectionId, subjectSections.id))
    .innerJoin(trackSubjects, eq(subjectSections.subjectId, trackSubjects.id))
    .innerJoin(trackGroups, eq(trackSubjects.groupId, trackGroups.id))
    .where(eq(subjectSections.yearId, yearId))
    .orderBy(asc(subjectDates.date), asc(trackGroups.code), asc(trackSubjects.code));
}

/**
 * The (รอบเรียน, วัน) pairs that already have attendance, as "id:YYYY-MM-DD".
 *
 * A day that has been checked in cannot be removed or moved from the schedule:
 * its attendance rows would be stranded outside the schedule and everybody's
 * เวลาเข้าเรียน would silently change. The same rule the จัดนักเรียนเข้าวิชา
 * screen enforces when it keeps an unticked day — read here so this screen can
 * say so *before* the press rather than after it.
 */
export async function checkedDayKeys(yearId: number): Promise<string[]> {
  const rows = await db
    .selectDistinct({ sectionId: attendance.sectionId, date: attendance.date })
    .from(attendance)
    .where(eq(attendance.yearId, yearId));
  return rows.map((r) => `${r.sectionId}:${r.date}`);
}

/** Does this one (รอบเรียน, วัน) have any attendance recorded? */
export async function dayIsChecked(sectionId: number, date: string): Promise<boolean> {
  const [row] = await db
    .select({ id: attendance.id })
    .from(attendance)
    .where(and(eq(attendance.sectionId, sectionId), eq(attendance.date, date)))
    .limit(1);
  return !!row;
}

/** One ห้อง of a ตารางรอบ, as the screen edits it. */
export interface BlockRow {
  id: number;
  label: string;
  source: ScheduleRowSource | null;
}

export interface BlockDay {
  date: string;
  note: string | null;
}

/**
 * ตารางรอบ — a block of weeks in one ภาคเรียน, laid out the way the school
 * prints it: วัน down the side, ห้อง under each วัน, the วิชา in the cell.
 * The cells are not in here; they are the ScheduleRow lines whose date is one
 * of `days` and whose sectionName is one of the `rows` labels.
 */
export interface ScheduleBlock {
  id: number;
  semester: number;
  name: string;
  sortOrder: number;
  rows: BlockRow[];
  days: BlockDay[];
}

export async function scheduleBlocksOf(yearId: number): Promise<ScheduleBlock[]> {
  const blocks = await db
    .select()
    .from(scheduleBlocks)
    .where(eq(scheduleBlocks.yearId, yearId))
    .orderBy(asc(scheduleBlocks.semester), asc(scheduleBlocks.sortOrder), asc(scheduleBlocks.id));
  if (!blocks.length) return [];
  const ids = blocks.map((b) => b.id);
  const [rows, days] = await Promise.all([
    db
      .select()
      .from(scheduleBlockRows)
      .where(inArray(scheduleBlockRows.blockId, ids))
      .orderBy(asc(scheduleBlockRows.sortOrder), asc(scheduleBlockRows.id)),
    db
      .select()
      .from(scheduleBlockDays)
      .where(inArray(scheduleBlockDays.blockId, ids))
      .orderBy(asc(scheduleBlockDays.date)),
  ]);
  return blocks.map((b) => ({
    id: b.id,
    semester: b.semester,
    name: b.name,
    sortOrder: b.sortOrder,
    rows: rows
      .filter((r) => r.blockId === b.id)
      .map((r) => ({ id: r.id, label: r.label, source: r.source ?? null })),
    days: days.filter((d) => d.blockId === b.id).map((d) => ({ date: d.date, note: d.note })),
  }));
}
