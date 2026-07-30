import 'server-only';
import { and, asc, eq, isNull, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  people,
  registrations,
  subjectSections,
  trackGroups,
  trackSubjects,
} from '@/db/schema';
import { attendanceRecords, classDatesOf } from './data';
import { evaluateSubject, type OverallResult } from './evaluate';
import type { YearRow } from './years';

export interface TranscriptLine {
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

export interface StudentTranscript {
  student: {
    id: number;
    code: string;
    fullName: string;
    gradeLevel: string | null;
    classroom: string | null;
    classNumber: number | null;
  };
  lines: TranscriptLine[];
}

/**
 * Build transcripts for a set of students in a year. Each student's line list is
 * their currently-assigned subjects with the auto-computed result. Subjects are
 * evaluated once and indexed by student, so N students × M subjects costs M
 * attendance queries, not N×M.
 */
export async function buildTranscripts(
  year: YearRow,
  studentIds: number[],
): Promise<StudentTranscript[]> {
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
    .orderBy(asc(people.gradeLevel), asc(people.classroom), asc(people.classNumber), asc(people.code));

  // Active registrations for these students, with section/subject/group metadata.
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

  // Evaluate each distinct section once — two รอบ of one วิชา run on different
  // days, so a student's result depends on which one they sat in.
  const sectionIds = [...new Set(regs.map((r) => r.sectionId))];
  const evalCache = new Map<
    number,
    { records: Awaited<ReturnType<typeof attendanceRecords>>; dates: string[] }
  >();
  await Promise.all(
    sectionIds.map(async (sid) => {
      const [records, dates] = await Promise.all([attendanceRecords(sid), classDatesOf(sid)]);
      evalCache.set(sid, { records, dates });
    }),
  );

  const linesByStudent = new Map<number, TranscriptLine[]>();
  for (const r of regs) {
    const cache = evalCache.get(r.sectionId)!;
    const e = evaluateSubject(r.studentId, cache.records, cache.dates);
    const arr = linesByStudent.get(r.studentId) ?? [];
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
    linesByStudent.set(r.studentId, arr);
  }

  return students.map((student) => ({
    student,
    lines: linesByStudent.get(student.id) ?? [],
  }));
}
