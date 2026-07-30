import 'server-only';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  attendance,
  people,
  registrations,
  subjectDates,
  subjectSections,
  trackGroups,
  trackSubjects,
} from '@/db/schema';
import { evaluateSubject, type AttendanceRecord } from './evaluate';

/** A student, minimal shape used across roster/attendance/results screens. */
export interface StudentRow {
  id: number;
  code: string;
  prefix: string | null;
  fullName: string;
  nickname: string | null;
  gradeLevel: string | null;
  classroom: string | null;
  classNumber: number | null;
}

/**
 * One running of a subject — the unit everything downstream works in. A subject
 * on its own has no days, no room and no students; a section has all three.
 */
export interface SectionRow {
  id: number;
  name: string;
  room: string | null;
  subjectId: number;
  subjectCode: string;
  subjectName: string;
  teacherName: string | null;
  groupId: number;
  groupCode: string;
  groupName: string;
}

const sectionSelect = {
  id: subjectSections.id,
  name: subjectSections.name,
  room: subjectSections.room,
  subjectId: trackSubjects.id,
  subjectCode: trackSubjects.code,
  subjectName: trackSubjects.name,
  teacherName: trackSubjects.teacherName,
  groupId: trackSubjects.groupId,
  groupCode: trackGroups.code,
  groupName: trackGroups.name,
};

/** Every section of an active subject in a year, by group → code → section. */
export async function listSections(yearId: number): Promise<SectionRow[]> {
  return db
    .select(sectionSelect)
    .from(subjectSections)
    .innerJoin(trackSubjects, eq(subjectSections.subjectId, trackSubjects.id))
    .innerJoin(trackGroups, eq(trackSubjects.groupId, trackGroups.id))
    .where(and(eq(subjectSections.yearId, yearId), eq(trackSubjects.active, true)))
    .orderBy(asc(trackGroups.code), asc(trackSubjects.code), asc(subjectSections.name));
}

/** One section with its subject and group, or null. */
export async function sectionById(sectionId: number): Promise<SectionRow | null> {
  const [row] = await db
    .select(sectionSelect)
    .from(subjectSections)
    .innerJoin(trackSubjects, eq(subjectSections.subjectId, trackSubjects.id))
    .innerJoin(trackGroups, eq(trackSubjects.groupId, trackGroups.id))
    .where(eq(subjectSections.id, sectionId))
    .limit(1);
  return row ?? null;
}

/** Scheduled class dates for a section ("YYYY-MM-DD", ascending). */
export async function classDatesOf(sectionId: number): Promise<string[]> {
  const rows = await db
    .select({ d: subjectDates.date })
    .from(subjectDates)
    .where(eq(subjectDates.sectionId, sectionId))
    .orderBy(asc(subjectDates.date));
  return rows.map((r) => r.d);
}

/** Scheduled class dates for every section in a year, indexed by section id. */
export async function classDatesBySection(yearId: number): Promise<Map<number, string[]>> {
  const rows = await db
    .select({ sectionId: subjectDates.sectionId, date: subjectDates.date })
    .from(subjectDates)
    .innerJoin(subjectSections, eq(subjectDates.sectionId, subjectSections.id))
    .where(eq(subjectSections.yearId, yearId))
    .orderBy(asc(subjectDates.date));
  const by = new Map<number, string[]>();
  for (const r of rows) {
    const arr = by.get(r.sectionId) ?? [];
    arr.push(r.date);
    by.set(r.sectionId, arr);
  }
  return by;
}

/** Students currently assigned (not dropped) to a section. */
export async function studentsInSection(sectionId: number): Promise<StudentRow[]> {
  return db
    .select({
      id: people.id,
      code: people.code,
      prefix: people.prefix,
      fullName: people.fullName,
      nickname: people.nickname,
      gradeLevel: people.gradeLevel,
      classroom: people.classroom,
      classNumber: people.classNumber,
    })
    .from(registrations)
    .innerJoin(people, eq(registrations.studentId, people.id))
    .where(and(eq(registrations.sectionId, sectionId), isNull(registrations.droppedAt)))
    .orderBy(
      asc(people.gradeLevel),
      asc(people.classroom),
      asc(people.classNumber),
      asc(people.code),
    );
}

/** Assigned students of a section with their presence across one class day. */
export interface DayRosterEntry {
  studentId: number;
  code: string;
  fullName: string;
  nickname: string | null;
  gradeLevel: string | null;
  classroom: string | null;
  /** เลขที่ in the student's own homeroom */
  classNumber: number | null;
  /** null = slot not yet recorded */
  morning: boolean | null;
  afternoon: boolean | null;
}

/**
 * The roster of one section on one class day, both slots at once — what the
 * check-in screen edits and what the ผลเช็คชื่อ day view reads back.
 */
export async function dayRoster(sectionId: number, date: string): Promise<DayRosterEntry[]> {
  const [students, existing] = await Promise.all([
    db
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
      .where(and(eq(registrations.sectionId, sectionId), isNull(registrations.droppedAt)))
      .orderBy(
        asc(people.gradeLevel),
        asc(people.classroom),
        asc(people.classNumber),
        asc(people.code),
      ),
    db
      .select({
        studentId: attendance.studentId,
        slot: attendance.slot,
        present: attendance.present,
      })
      .from(attendance)
      .where(and(eq(attendance.sectionId, sectionId), eq(attendance.date, date))),
  ]);

  const bySlot = new Map<string, boolean>();
  for (const e of existing) bySlot.set(`${e.studentId}:${e.slot}`, e.present);

  return students.map((s) => ({
    ...s,
    morning: bySlot.get(`${s.studentId}:morning`) ?? null,
    afternoon: bySlot.get(`${s.studentId}:afternoon`) ?? null,
  }));
}

/** Raw attendance records for one section, shaped for the evaluator. */
export async function attendanceRecords(sectionId: number): Promise<AttendanceRecord[]> {
  const rows = await db
    .select({
      date: attendance.date,
      slot: attendance.slot,
      studentId: attendance.studentId,
      present: attendance.present,
    })
    .from(attendance)
    .where(eq(attendance.sectionId, sectionId));
  return rows.map((r) => ({
    date: r.date,
    slot: r.slot,
    studentId: r.studentId,
    present: r.present,
  }));
}

/**
 * Evaluate every assigned student in a section at once — one attendance query,
 * one schedule query, then the pure evaluator per student.
 */
export async function evaluateAll(sectionId: number) {
  const [students, records, dates] = await Promise.all([
    studentsInSection(sectionId),
    attendanceRecords(sectionId),
    classDatesOf(sectionId),
  ]);
  return students.map((s) => ({
    student: s,
    evaluation: evaluateSubject(s.id, records, dates),
  }));
}

/** Active students assigned to each section of a year, as counts. */
export async function studentCountsBySection(yearId: number): Promise<Map<number, number>> {
  const rows = await db
    .select({ sectionId: registrations.sectionId, n: sql<number>`count(*)` })
    .from(registrations)
    .where(and(eq(registrations.yearId, yearId), isNull(registrations.droppedAt)))
    .groupBy(registrations.sectionId);
  return new Map(rows.map((r) => [r.sectionId, Number(r.n)]));
}

/** Distinct dates each section has attendance for — "how far has check-in got". */
export async function checkedDayCountsBySection(yearId: number): Promise<Map<number, number>> {
  const rows = await db
    .select({
      sectionId: attendance.sectionId,
      n: sql<number>`count(distinct ${attendance.date})`,
    })
    .from(attendance)
    .where(eq(attendance.yearId, yearId))
    .groupBy(attendance.sectionId);
  return new Map(rows.map((r) => [r.sectionId, Number(r.n)]));
}

/** Count of active groups / subjects / synced students — for the dashboard. */
export async function adminCounts() {
  const [[g], [s], [stu]] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(trackGroups).where(eq(trackGroups.active, true)),
    db.select({ n: sql<number>`count(*)` }).from(trackSubjects).where(eq(trackSubjects.active, true)),
    db.select({ n: sql<number>`count(*)` }).from(people).where(eq(people.type, 'student')),
  ]);
  return {
    groups: Number(g?.n ?? 0),
    subjects: Number(s?.n ?? 0),
    students: Number(stu?.n ?? 0),
  };
}
