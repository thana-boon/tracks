import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  attendance,
  subjectDates,
  subjectSections,
  trackGroups,
  trackSubjects,
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
  /** ภาคเรียน/ช่วง the วิชา belongs to — null on a วิชา nobody has placed yet */
  semester: number | null;
  phase: number | null;
  groupId: number;
  groupCode: string;
  groupName: string;
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
      semester: trackSubjects.semester,
      phase: trackSubjects.phase,
      groupId: trackGroups.id,
      groupCode: trackGroups.code,
      groupName: trackGroups.name,
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
