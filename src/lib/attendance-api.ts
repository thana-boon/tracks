import 'server-only';
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import { attendance, people, registrations, subjectSections } from '@/db/schema';
import { sectionsOnDate } from './subjects-for-user';
import { resolveRecords, type IncomingRecord, type Rejected } from './attendance-api-core';
import type { YearRow } from './years';

/**
 * The db half of /api/public/v1 — what another system reads (the ตาราง of a
 * day) and writes (เช็คชื่อ). Both read the same rows as the เช็คชื่อ screen:
 * sectionsOnDate() for which รอบเรียน meet, and the `attendance` table for what
 * has been recorded, so the two can never tell different stories.
 */

export interface ApiStudent {
  studentId: number;
  code: string;
  fullName: string;
  gradeLevel: string | null;
  classroom: string | null;
  classNumber: number | null;
  /** null = ยังไม่เช็ค */
  morning: boolean | null;
  afternoon: boolean | null;
}

export interface ApiSection {
  sectionId: number;
  name: string;
  room: string | null;
  subject: { code: string; name: string };
  group: { code: string; name: string };
  teacherName: string | null;
  studentCount: number;
  checked: { morning: boolean; afternoon: boolean };
  students: ApiStudent[];
}

/** Every รอบเรียน meeting on `date`, each with its นักเรียน and what is recorded for them. */
export async function scheduleOf(year: YearRow, date: string): Promise<ApiSection[]> {
  const sections = await sectionsOnDate(year, date);
  if (sections.length === 0) return [];
  const ids = sections.map((s) => s.id);

  const [students, recorded] = await Promise.all([
    db
      .select({
        sectionId: registrations.sectionId,
        studentId: people.id,
        code: people.code,
        fullName: people.fullName,
        gradeLevel: people.gradeLevel,
        classroom: people.classroom,
        classNumber: people.classNumber,
      })
      .from(registrations)
      .innerJoin(people, eq(registrations.studentId, people.id))
      .where(and(inArray(registrations.sectionId, ids), isNull(registrations.droppedAt)))
      .orderBy(asc(people.gradeLevel), asc(people.classroom), asc(people.classNumber), asc(people.code)),
    db
      .select({
        sectionId: attendance.sectionId,
        studentId: attendance.studentId,
        slot: attendance.slot,
        present: attendance.present,
      })
      .from(attendance)
      .where(and(inArray(attendance.sectionId, ids), eq(attendance.date, date))),
  ]);

  const mark = new Map(recorded.map((r) => [`${r.sectionId}:${r.studentId}:${r.slot}`, r.present]));
  const rosterOf = new Map<number, ApiStudent[]>();
  for (const { sectionId, ...s } of students) {
    const list = rosterOf.get(sectionId) ?? [];
    list.push({
      ...s,
      morning: mark.get(`${sectionId}:${s.studentId}:morning`) ?? null,
      afternoon: mark.get(`${sectionId}:${s.studentId}:afternoon`) ?? null,
    });
    rosterOf.set(sectionId, list);
  }

  return sections.map((s) => ({
    sectionId: s.id,
    name: s.name,
    room: s.room,
    subject: { code: s.subjectCode, name: s.subjectName },
    group: { code: s.groupCode, name: s.groupName },
    teacherName: s.teacherName,
    studentCount: s.studentCount,
    checked: { morning: s.morningChecked, afternoon: s.afternoonChecked },
    students: rosterOf.get(s.id) ?? [],
  }));
}

export interface SaveOutcome {
  /** null when the named sectionId does not meet on that date */
  sections: { sectionId: number; saved: number }[] | null;
  saved: number;
  /** records sent with present: null whose row was removed */
  cleared: number;
  rejected: Rejected[];
}

/**
 * Write one slot of เช็คชื่อ for whoever the other system sent.
 *
 * Only the นักเรียน in `records` are touched: someone the scanner never saw
 * stays ยังไม่เช็ค rather than becoming ไม่มา, because "not in this batch" is
 * not the same as "absent" — the other system may send the room in several
 * batches. A นักเรียน already checked (by a ครู, or an earlier batch) is
 * overwritten, the same as saving over them on the เช็คชื่อ screen.
 * `present: null` removes the row, so that นักเรียน is ยังไม่เช็ค again.
 */
export async function saveFromApi(input: {
  year: YearRow;
  date: string;
  slot: 'morning' | 'afternoon';
  sectionId?: number;
  records: IncomingRecord[];
  actor: string;
}): Promise<SaveOutcome> {
  const { year, date, slot, records, actor } = input;

  const meeting = await sectionsOnDate(year, date);
  const sectionIds = meeting
    .map((s) => s.id)
    .filter((id) => input.sectionId === undefined || id === input.sectionId);
  if (input.sectionId !== undefined && sectionIds.length === 0)
    return { sections: null, saved: 0, cleared: 0, rejected: [] };

  const codes = [...new Set(records.flatMap((r) => (r.studentCode?.trim() ? [r.studentCode.trim()] : [])))];
  const ids = [...new Set(records.flatMap((r) => (r.studentId ? [r.studentId] : [])))];

  const [knownRows, enrolments, subjectOf] = await Promise.all([
    codes.length || ids.length
      ? db
          .select({ id: people.id, code: people.code })
          .from(people)
          .where(
            and(
              eq(people.type, 'student'),
              or(
                codes.length ? inArray(people.code, codes) : undefined,
                ids.length ? inArray(people.id, ids) : undefined,
              ),
            ),
          )
      : Promise.resolve([]),
    sectionIds.length
      ? db
          .select({ studentId: people.id, code: people.code, sectionId: registrations.sectionId })
          .from(registrations)
          .innerJoin(people, eq(registrations.studentId, people.id))
          .where(and(inArray(registrations.sectionId, sectionIds), isNull(registrations.droppedAt)))
      : Promise.resolve([]),
    sectionIds.length
      ? db
          .select({ id: subjectSections.id, subjectId: subjectSections.subjectId })
          .from(subjectSections)
          .where(inArray(subjectSections.id, sectionIds))
      : Promise.resolve([]),
  ]);

  const { resolved, rejected } = resolveRecords(records, enrolments, {
    codes: new Set(knownRows.map((p) => p.code)),
    ids: new Set(knownRows.map((p) => p.id)),
  });
  const subjectBy = new Map(subjectOf.map((s) => [s.id, s.subjectId]));

  const toSave = resolved.filter((r) => r.present !== null);
  const toClear = resolved.filter((r) => r.present === null);

  await db.transaction(async (tx) => {
    for (const r of toClear) {
      await tx
        .delete(attendance)
        .where(
          and(
            eq(attendance.sectionId, r.sectionId),
            eq(attendance.date, date),
            eq(attendance.slot, slot),
            eq(attendance.studentId, r.studentId),
          ),
        );
    }
    for (const r of toSave) {
      await tx
        .insert(attendance)
        .values({
          yearId: year.id,
          subjectId: subjectBy.get(r.sectionId)!,
          sectionId: r.sectionId,
          studentId: r.studentId,
          date,
          slot,
          present: r.present!,
          recordedBy: actor,
        })
        .onConflictDoUpdate({
          target: [attendance.sectionId, attendance.date, attendance.slot, attendance.studentId],
          set: { present: r.present!, recordedBy: actor, recordedAt: new Date() },
        });
    }
  });

  const perSection = new Map<number, number>();
  for (const r of toSave) perSection.set(r.sectionId, (perSection.get(r.sectionId) ?? 0) + 1);
  return {
    sections: [...perSection].map(([sectionId, saved]) => ({ sectionId, saved })),
    saved: toSave.length,
    cleared: toClear.length,
    rejected,
  };
}
