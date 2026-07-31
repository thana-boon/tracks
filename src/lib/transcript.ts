import 'server-only';
import { and, asc, eq, isNull, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  academicYears,
  people,
  registrations,
  subjectSections,
  trackGroups,
  trackSubjects,
} from '@/db/schema';
import { attendanceRecords, classDatesOf } from './data';
import { evaluateSubject, type OverallResult } from './evaluate';
import type { YearRow } from './years';

/**
 * Two readings of a student's วิชาเสริม, which are not the same document:
 *
 *   buildYearResults  — one year, every subject, every result. What the หน้า
 *                       นักเรียน and หน้าห้องที่ปรึกษา show: a ไม่ผ่าน is exactly
 *                       what an advisor needs to see while there is still time
 *                       to do something about it.
 *   buildTranscripts  — every year, วิชาที่ผ่าน only. The printed ทรานสคริปต์
 *                       (spec §4.6): students collect subjects across ม.4-6, and
 *                       the certificate records what was earned, so a subject
 *                       failed or never assessed is left off rather than printed
 *                       as a permanent bad mark.
 *
 * Both evaluate each section once and index the result by student, so N
 * students × M sections costs M attendance queries rather than N×M.
 */

interface SectionEvaluation {
  records: Awaited<ReturnType<typeof attendanceRecords>>;
  dates: string[];
}

/** Attendance + schedule for each section, fetched once, in parallel. */
async function loadSections(sectionIds: number[]): Promise<Map<number, SectionEvaluation>> {
  const cache = new Map<number, SectionEvaluation>();
  await Promise.all(
    [...new Set(sectionIds)].map(async (sid) => {
      const [records, dates] = await Promise.all([attendanceRecords(sid), classDatesOf(sid)]);
      cache.set(sid, { records, dates });
    }),
  );
  return cache;
}

export interface StudentInfo {
  id: number;
  code: string;
  fullName: string;
  gradeLevel: string | null;
  classroom: string | null;
  classNumber: number | null;
}

/** The students, in the reading order every roster uses: ชั้น → ห้อง → เลขที่. */
async function loadStudents(studentIds: number[]): Promise<StudentInfo[]> {
  return db
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
    .orderBy(
      asc(people.gradeLevel),
      asc(people.classroom),
      asc(people.classNumber),
      asc(people.code),
    );
}

// ── one year, every result ───────────────────────────────────

export interface YearResultLine {
  groupCode: string;
  subjectCode: string;
  subjectName: string;
  /** which running of the subject the student sat in */
  sectionName: string;
  teacherName: string | null;
  room: string | null;
  totalDays: number;
  attendedRatio: number;
  overall: OverallResult;
}

export interface StudentYearResults {
  student: StudentInfo;
  lines: YearResultLine[];
}

/** Every subject a set of students is assigned in one year, with its result. */
export async function buildYearResults(
  year: YearRow,
  studentIds: number[],
): Promise<StudentYearResults[]> {
  if (studentIds.length === 0) return [];

  const students = await loadStudents(studentIds);
  const regs = await db
    .select({
      studentId: registrations.studentId,
      sectionId: subjectSections.id,
      sectionName: subjectSections.name,
      room: subjectSections.room,
      subjectCode: trackSubjects.code,
      subjectName: trackSubjects.name,
      teacherName: trackSubjects.teacherName,
      groupCode: trackGroups.code,
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

  const cache = await loadSections(regs.map((r) => r.sectionId));
  const byStudent = new Map<number, YearResultLine[]>();
  for (const r of regs) {
    const c = cache.get(r.sectionId)!;
    const e = evaluateSubject(r.studentId, c.records, c.dates);
    const arr = byStudent.get(r.studentId) ?? [];
    arr.push({
      groupCode: r.groupCode,
      subjectCode: r.subjectCode,
      subjectName: r.subjectName,
      sectionName: r.sectionName,
      teacherName: r.teacherName,
      room: r.room,
      totalDays: e.totalDays,
      attendedRatio: e.attendedRatio,
      overall: e.overall,
    });
    byStudent.set(r.studentId, arr);
  }

  return students.map((student) => ({ student, lines: byStudent.get(student.id) ?? [] }));
}

// ── every year, วิชาที่ผ่าน only (the printed ทรานสคริปต์) ─────

/** The results that earn a line on the document. Everything else is omitted. */
const PASSING: ReadonlySet<OverallResult> = new Set<OverallResult>(['excellent', 'pass']);

export interface TranscriptLine {
  subjectCode: string;
  subjectName: string;
  /** Thai Buddhist year the subject was taken in, e.g. "2568" */
  year: string;
  teacherName: string | null;
  totalDays: number;
  /** always a passing result — see PASSING */
  overall: OverallResult;
}

/** วิชาที่ผ่านของนักเรียนในกลุ่มวิชาหนึ่ง — one banded block on the document. */
export interface TranscriptGroup {
  code: string;
  name: string;
  lines: TranscriptLine[];
}

export interface StudentTranscript {
  student: StudentInfo;
  groups: TranscriptGroup[];
  /** total lines printed — the "รวมวิชาที่ผ่าน" figure */
  passedCount: number;
  /** distinct ปีการศึกษา represented, ascending */
  years: string[];
}

/** Accumulated transcripts: all years, grouped by กลุ่มวิชา, passing only. */
export async function buildTranscripts(studentIds: number[]): Promise<StudentTranscript[]> {
  if (studentIds.length === 0) return [];

  const students = await loadStudents(studentIds);

  // No year filter — the accumulation across ม.4-6 is the point of the document.
  const regs = await db
    .select({
      studentId: registrations.studentId,
      sectionId: subjectSections.id,
      year: academicYears.year,
      subjectCode: trackSubjects.code,
      subjectName: trackSubjects.name,
      teacherName: trackSubjects.teacherName,
      groupCode: trackGroups.code,
      groupName: trackGroups.name,
    })
    .from(registrations)
    .innerJoin(subjectSections, eq(registrations.sectionId, subjectSections.id))
    .innerJoin(academicYears, eq(registrations.yearId, academicYears.id))
    .innerJoin(trackSubjects, eq(registrations.subjectId, trackSubjects.id))
    .innerJoin(trackGroups, eq(trackSubjects.groupId, trackGroups.id))
    .where(and(isNull(registrations.droppedAt), inArray(registrations.studentId, studentIds)))
    .orderBy(asc(academicYears.year), asc(trackGroups.code), asc(trackSubjects.code));

  const cache = await loadSections(regs.map((r) => r.sectionId));

  // studentId → groupCode → block. Insertion order follows the year-then-code
  // order above, so a group first appears where the student first took
  // something in it: PRE-TRACK (ม.4) lands ahead of a group started in ม.5.
  const byStudent = new Map<number, Map<string, TranscriptGroup>>();
  const yearsByStudent = new Map<number, Set<string>>();

  for (const r of regs) {
    const c = cache.get(r.sectionId)!;
    const e = evaluateSubject(r.studentId, c.records, c.dates);
    if (!PASSING.has(e.overall)) continue;

    let groups = byStudent.get(r.studentId);
    if (!groups) byStudent.set(r.studentId, (groups = new Map()));
    let group = groups.get(r.groupCode);
    if (!group)
      groups.set(r.groupCode, (group = { code: r.groupCode, name: r.groupName, lines: [] }));
    group.lines.push({
      subjectCode: r.subjectCode,
      subjectName: r.subjectName,
      year: r.year,
      teacherName: r.teacherName,
      totalDays: e.totalDays,
      overall: e.overall,
    });

    let years = yearsByStudent.get(r.studentId);
    if (!years) yearsByStudent.set(r.studentId, (years = new Set()));
    years.add(r.year);
  }

  return students.map((student) => {
    const groups = [...(byStudent.get(student.id)?.values() ?? [])];
    return {
      student,
      groups,
      passedCount: groups.reduce((n, g) => n + g.lines.length, 0),
      years: [...(yearsByStudent.get(student.id) ?? [])].sort(),
    };
  });
}
