import 'server-only';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  homerooms,
  people,
  registrations,
  subjectSections,
  trackGroups,
  trackSubjects,
} from '@/db/schema';
import { attendanceRecords, classDatesOf } from './data';
import { evaluateSubject, type DayResult } from './evaluate';
import type { YearRow } from './years';

/**
 * ห้องที่ปรึกษา — the homeroom a student belongs to, identified everywhere
 * (URLs included) by its "ม.5/2" key so a room survives a round trip through a
 * query string without needing an id the Users Service does not give us.
 */
export interface Homeroom {
  gradeLevel: string;
  classroom: string;
  /** "ม.5/2" */
  key: string;
  /** a room can be advised by more than one teacher */
  teacherNames: string[];
  studentCount: number;
}

export function roomKey(gradeLevel: string, classroom: string): string {
  return `${gradeLevel}/${classroom}`;
}

/** Split "ม.5/2" back into its parts; null when the shape is wrong. */
export function parseRoomKey(key: string): { gradeLevel: string; classroom: string } | null {
  const i = key.lastIndexOf('/');
  if (i <= 0 || i === key.length - 1) return null;
  return { gradeLevel: key.slice(0, i), classroom: key.slice(i + 1) };
}

/**
 * Homerooms of a year. `teacherId` narrows it to the rooms that teacher
 * advises — the difference between what a ครูประจำชั้น sees (their own) and
 * what an admin sees (all of them).
 */
export async function listHomerooms(
  year: YearRow,
  teacherId?: number,
): Promise<Homeroom[]> {
  const [rows, counts] = await Promise.all([
    db
      .select({
        gradeLevel: homerooms.gradeLevel,
        classroom: homerooms.classroom,
        teacherName: people.fullName,
      })
      .from(homerooms)
      .innerJoin(people, eq(homerooms.teacherId, people.id))
      .where(
        and(
          eq(homerooms.yearId, year.id),
          teacherId ? eq(homerooms.teacherId, teacherId) : undefined,
        ),
      )
      .orderBy(asc(homerooms.gradeLevel), asc(homerooms.classroom), asc(people.fullName)),
    db
      .select({
        gradeLevel: people.gradeLevel,
        classroom: people.classroom,
        n: sql<number>`count(*)`,
      })
      .from(people)
      .where(and(eq(people.type, 'student'), eq(people.status, 'studying')))
      .groupBy(people.gradeLevel, people.classroom),
  ]);

  const countBy = new Map(
    counts.map((c) => [roomKey(c.gradeLevel ?? '', c.classroom ?? ''), Number(c.n)]),
  );
  const by = new Map<string, Homeroom>();
  for (const r of rows) {
    const key = roomKey(r.gradeLevel, r.classroom);
    const room =
      by.get(key) ??
      {
        gradeLevel: r.gradeLevel,
        classroom: r.classroom,
        key,
        teacherNames: [],
        studentCount: countBy.get(key) ?? 0,
      };
    if (r.teacherName && !room.teacherNames.includes(r.teacherName))
      room.teacherNames.push(r.teacherName);
    by.set(key, room);
  }
  return [...by.values()];
}

/**
 * Studying students of the given rooms, indexed by their "ม.5/2" key and in
 * เลขที่ order — the order a ครูประจำชั้น reads a room in, and the order the
 * report prints.
 */
export async function studentsByRoom(rooms: Homeroom[]): Promise<Map<string, number[]>> {
  const by = new Map<string, number[]>(rooms.map((r) => [r.key, []]));
  if (rooms.length === 0) return by;

  const rows = await db
    .select({ id: people.id, gradeLevel: people.gradeLevel, classroom: people.classroom })
    .from(people)
    .where(
      and(
        eq(people.type, 'student'),
        eq(people.status, 'studying'),
        inArray(
          people.gradeLevel,
          [...new Set(rooms.map((r) => r.gradeLevel))],
        ),
      ),
    )
    .orderBy(asc(people.classNumber), asc(people.code));

  for (const s of rows) {
    const list = by.get(roomKey(s.gradeLevel ?? '', s.classroom ?? ''));
    if (list) list.push(s.id);
  }
  return by;
}

/* ── The report an admin exports ─────────────────────────────────────────── */

/** One class date of one วิชาเสริม, as the report prints it. */
export interface ReportDay {
  date: string;
  subjectCode: string;
  subjectName: string;
  sectionName: string;
  morning: boolean | null;
  afternoon: boolean | null;
  /** null = the day is scheduled but nobody has checked it yet */
  result: DayResult | null;
}

export interface ReportStudent {
  id: number;
  code: string;
  fullName: string;
  gradeLevel: string | null;
  classroom: string | null;
  classNumber: number | null;
}

export interface HomeroomReportEntry {
  student: ReportStudent;
  /** every scheduled class date of every subject the student sits, ascending */
  days: ReportDay[];
}

/**
 * Per-student attendance across every วิชาเสริม they are registered for, day by
 * day. Unlike a transcript this keeps the individual class dates — the point of
 * the report is to show a ครูประจำชั้น which day a student was away — and it
 * keeps dates that are scheduled but not yet checked, marked as pending.
 *
 * Sections are evaluated once and reused across students, so a whole ห้อง costs
 * one pass over the sections its students share, not one per student.
 */
export async function buildHomeroomReport(
  year: YearRow,
  studentIds: number[],
): Promise<HomeroomReportEntry[]> {
  if (studentIds.length === 0) return [];

  const students = await db
    .select({
      id: people.id,
      code: people.code,
      fullName: people.fullName,
      gradeLevel: people.gradeLevel,
      classroom: people.classroom,
      classNumber: people.classNumber,
    })
    .from(people)
    .where(and(eq(people.type, 'student'), inArray(people.id, studentIds)))
    .orderBy(asc(people.classNumber), asc(people.code));

  const regs = await db
    .select({
      studentId: registrations.studentId,
      sectionId: subjectSections.id,
      sectionName: subjectSections.name,
      subjectCode: trackSubjects.code,
      subjectName: trackSubjects.name,
    })
    .from(registrations)
    .innerJoin(subjectSections, eq(registrations.sectionId, subjectSections.id))
    .innerJoin(trackSubjects, eq(registrations.subjectId, trackSubjects.id))
    .innerJoin(trackGroups, eq(trackSubjects.groupId, trackGroups.id))
    .where(
      and(
        eq(registrations.yearId, year.id),
        isNull(registrations.droppedAt),
        inArray(registrations.studentId, studentIds),
      ),
    )
    .orderBy(asc(trackGroups.code), asc(trackSubjects.code), asc(subjectSections.name));

  const sectionIds = [...new Set(regs.map((r) => r.sectionId))];
  const cache = new Map<
    number,
    { records: Awaited<ReturnType<typeof attendanceRecords>>; dates: string[] }
  >();
  await Promise.all(
    sectionIds.map(async (sid) => {
      const [records, dates] = await Promise.all([attendanceRecords(sid), classDatesOf(sid)]);
      cache.set(sid, { records, dates });
    }),
  );

  const daysBy = new Map<number, ReportDay[]>();
  for (const r of regs) {
    const { records, dates } = cache.get(r.sectionId)!;
    const e = evaluateSubject(r.studentId, records, dates);
    const held = new Map(e.days.map((d) => [d.date, d]));

    const rows = daysBy.get(r.studentId) ?? [];
    // Walk the schedule, not the held days: a date nobody checked still belongs
    // in the report — as รอประเมิน, so the gap is visible rather than missing.
    for (const date of dates.length > 0 ? dates : e.days.map((d) => d.date)) {
      const day = held.get(date);
      rows.push({
        date,
        subjectCode: r.subjectCode,
        subjectName: r.subjectName,
        sectionName: r.sectionName,
        morning: day?.morning ?? null,
        afternoon: day?.afternoon ?? null,
        result: day?.result ?? null,
      });
    }
    daysBy.set(r.studentId, rows);
  }

  return students.map((student) => ({
    student,
    days: (daysBy.get(student.id) ?? []).sort(
      (a, b) => a.date.localeCompare(b.date) || a.subjectCode.localeCompare(b.subjectCode),
    ),
  }));
}

/* ── The matrix the printed report is laid out as ────────────────────────── */

/** What one student did on one class date: a subject code and how it went. */
export interface MatrixCell {
  subjectCode: string;
  /** null = the day is scheduled but not checked yet (รอประเมิน) */
  result: DayResult | null;
}

export interface MatrixRow {
  student: ReportStudent;
  /** keyed by "YYYY-MM-DD"; a student may sit two วิชา on one date */
  byDate: Map<string, MatrixCell[]>;
}

export interface RoomMatrix {
  /** "ม.5/2" */
  key: string;
  teacherNames: string[];
  /** the class dates that become columns, ascending */
  dates: string[];
  rows: MatrixRow[];
}

/**
 * Turn per-student day lists into the grid the report prints: one row per
 * student, one column per class date. Columns are the union of every date the
 * room's students meet, so a row is blank on a date its student has no class —
 * which is exactly what a ครูประจำชั้น scanning for gaps wants to see.
 *
 * `month` ("YYYY-MM") keeps the grid to one month; a whole year's worth of
 * columns would not fit across the page.
 */
export function toRoomMatrix(
  key: string,
  teacherNames: string[],
  entries: HomeroomReportEntry[],
  month?: string,
): RoomMatrix {
  const dates = new Set<string>();
  const rows: MatrixRow[] = entries.map((e) => {
    const byDate = new Map<string, MatrixCell[]>();
    for (const d of e.days) {
      if (month && !d.date.startsWith(month)) continue;
      dates.add(d.date);
      const cells = byDate.get(d.date) ?? [];
      cells.push({ subjectCode: d.subjectCode, result: d.result });
      byDate.set(d.date, cells);
    }
    return { student: e.student, byDate };
  });
  return { key, teacherNames, dates: [...dates].sort(), rows };
}
