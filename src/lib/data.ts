import 'server-only';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  attendance,
  people,
  registrations,
  subjectDays,
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

export interface SubjectRow {
  id: number;
  code: string;
  name: string;
  teacherName: string | null;
  groupId: number;
  groupCode: string;
  groupName: string;
  active: boolean;
}

/** All active subjects with their group, ordered by group then code. */
export async function listSubjects(activeOnly = false): Promise<SubjectRow[]> {
  const rows = await db
    .select({
      id: trackSubjects.id,
      code: trackSubjects.code,
      name: trackSubjects.name,
      teacherName: trackSubjects.teacherName,
      groupId: trackSubjects.groupId,
      groupCode: trackGroups.code,
      groupName: trackGroups.name,
      active: trackSubjects.active,
    })
    .from(trackSubjects)
    .innerJoin(trackGroups, eq(trackSubjects.groupId, trackGroups.id))
    .orderBy(asc(trackGroups.code), asc(trackSubjects.code));
  return activeOnly ? rows.filter((r) => r.active) : rows;
}

/** Meeting weekdays for a subject in a year (numbers 0-6, ascending). */
export async function meetingDaysOf(subjectId: number, yearId: number): Promise<number[]> {
  const rows = await db
    .select({ d: subjectDays.dayOfWeek })
    .from(subjectDays)
    .where(and(eq(subjectDays.subjectId, subjectId), eq(subjectDays.yearId, yearId)))
    .orderBy(asc(subjectDays.dayOfWeek));
  return rows.map((r) => r.d);
}

/** Students currently assigned (not dropped) to a subject in a year. */
export async function studentsInSubject(
  subjectId: number,
  yearId: number,
): Promise<StudentRow[]> {
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
    .where(
      and(
        eq(registrations.subjectId, subjectId),
        eq(registrations.yearId, yearId),
        isNull(registrations.droppedAt),
      ),
    )
    .orderBy(asc(people.gradeLevel), asc(people.classroom), asc(people.classNumber), asc(people.code));
}

/** Raw attendance records for one subject/year, shaped for the evaluator. */
export async function attendanceRecords(
  subjectId: number,
  yearId: number,
): Promise<AttendanceRecord[]> {
  const rows = await db
    .select({
      date: attendance.date,
      slot: attendance.slot,
      studentId: attendance.studentId,
      present: attendance.present,
    })
    .from(attendance)
    .where(and(eq(attendance.subjectId, subjectId), eq(attendance.yearId, yearId)));
  return rows.map((r) => ({
    date: r.date,
    slot: r.slot,
    studentId: r.studentId,
    present: r.present,
  }));
}

/**
 * Evaluate every assigned student in a subject at once — one attendance query,
 * one meeting-days query, then the pure evaluator per student.
 */
export async function evaluateAll(subjectId: number, yearId: number) {
  const [students, records, days] = await Promise.all([
    studentsInSubject(subjectId, yearId),
    attendanceRecords(subjectId, yearId),
    meetingDaysOf(subjectId, yearId),
  ]);
  return students.map((s) => ({
    student: s,
    evaluation: evaluateSubject(s.id, records, days),
  }));
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
