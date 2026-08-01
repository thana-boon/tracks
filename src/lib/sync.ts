import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { academicYears, homerooms, people } from '@/db/schema';
import { schoolos } from './schoolos';
import { TRACK_GRADES } from './utils';

/**
 * One-way sync from the SchoolOS Users Service. The Users Service owns
 * identity; this app only mirrors it (spec §2) — no local edits, no write-back.
 * Every function here is idempotent and safe to re-run.
 */

export interface SyncCounts {
  created: number;
  updated: number;
  total: number;
}

/** Mirror the school calendar. The active year follows the Users Service. */
export async function syncYears(): Promise<SyncCounts> {
  const years = await schoolos.academicYears();
  let created = 0;
  let updated = 0;

  for (const y of years) {
    const values = {
      year: String(y.year),
      startDate: y.startDate,
      endDate: y.endDate,
      isActive: y.isActive,
      syncedAt: new Date(),
    };
    const [existing] = await db
      .select({ id: academicYears.id })
      .from(academicYears)
      .where(eq(academicYears.schoolosId, y.id))
      .limit(1);
    if (existing) {
      await db.update(academicYears).set(values).where(eq(academicYears.id, existing.id));
      updated += 1;
    } else {
      await db.insert(academicYears).values({ schoolosId: y.id, ...values });
      created += 1;
    }
  }

  // Exactly one active year locally, mirroring the source. If the source
  // returned none as active (or the scope-fallback path), keep whatever is set.
  const activeIds = years.filter((y) => y.isActive).map((y) => y.id);
  if (activeIds.length > 0) {
    await db.update(academicYears).set({ isActive: false });
    await db
      .update(academicYears)
      .set({ isActive: true })
      .where(inArray(academicYears.schoolosId, activeIds.slice(0, 1)));
  }

  return { created, updated, total: years.length };
}

/**
 * Mirror students of ม.4-6 — every status, not just the ones still studying.
 *
 * A leaver is never deleted here, and never inferred from an absence: the
 * Users Service reports `graduated` / `withdrawn` itself, so the mirror simply
 * records what it is told. Rows the roster no longer returns at all are left
 * untouched — after the calendar rolls over a graduate has no enrolment in the
 * new year and vanishes from the endpoint entirely (Users API §5.3), and the
 * copy already captured here is the only remaining record of them.
 *
 * That is also why grade/room are never overwritten with null: the endpoint
 * reports them for the *active* year, so a student with no enrolment left
 * comes back with nulls, and blanking the mirror would lose which ม. they
 * finished — the one fact หน้านักเรียนจบการศึกษา is built on.
 */
export async function syncStudents(): Promise<SyncCounts> {
  let created = 0;
  let updated = 0;
  let total = 0;

  for (const grade of TRACK_GRADES) {
    const students = await schoolos.studentsOfGrade(grade);
    total += students.length;
    for (const s of students) {
      const values = {
        code: s.studentCode,
        prefix: s.prefix,
        firstName: s.firstName,
        lastName: s.lastName,
        fullName: s.fullName,
        nickname: s.nickname,
        gender: s.gender,
        gradeLevel: s.gradeLevel,
        classroom: s.classroom,
        classNumber: s.classNumber,
        status: s.status,
        syncedAt: new Date(),
      };
      const [existing] = await db
        .select({
          id: people.id,
          gradeLevel: people.gradeLevel,
          classroom: people.classroom,
          classNumber: people.classNumber,
        })
        .from(people)
        .where(and(eq(people.type, 'student'), eq(people.schoolosId, s.id)))
        .limit(1);
      if (existing) {
        await db
          .update(people)
          .set({
            ...values,
            gradeLevel: s.gradeLevel ?? existing.gradeLevel,
            classroom: s.classroom ?? existing.classroom,
            classNumber: s.classNumber ?? existing.classNumber,
          })
          .where(eq(people.id, existing.id));
        updated += 1;
      } else {
        await db.insert(people).values({ type: 'student', schoolosId: s.id, ...values });
        created += 1;
      }
    }
  }

  return { created, updated, total };
}

/** Mirror active teachers (all of them — any teacher may take attendance). */
export async function syncTeachers(): Promise<SyncCounts> {
  const teachers = await schoolos.allTeachers();
  let created = 0;
  let updated = 0;

  for (const t of teachers) {
    const values = {
      code: t.teacherCode,
      prefix: t.prefix,
      firstName: t.firstName,
      lastName: t.lastName,
      fullName: t.fullName,
      schoolosRole: t.role,
      status: t.employmentStatus,
      syncedAt: new Date(),
    };
    const [existing] = await db
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.type, 'teacher'), eq(people.schoolosId, t.id)))
      .limit(1);
    if (existing) {
      await db.update(people).set(values).where(eq(people.id, existing.id));
      updated += 1;
    } else {
      await db.insert(people).values({ type: 'teacher', schoolosId: t.id, ...values });
      created += 1;
    }
  }

  return { created, updated, total: teachers.length };
}

/**
 * Mirror homeroom-advisor assignments (ครูที่ปรึกษา) of ม.4-6 for the active
 * year. Replaces the year's rows wholesale — the Users Service is the owner.
 * Requires teachers to be synced first (advisors are matched by SchoolOS id).
 */
export async function syncHomerooms(yearId: number, schoolosYearId: number): Promise<SyncCounts> {
  const teacherIdMap = new Map<number, number>();
  for (const t of await db
    .select({ id: people.id, schoolosId: people.schoolosId })
    .from(people)
    .where(eq(people.type, 'teacher'))) {
    teacherIdMap.set(t.schoolosId, t.id);
  }

  let total = 0;
  const rows: { yearId: number; gradeLevel: string; classroom: string; teacherId: number }[] = [];
  for (const grade of TRACK_GRADES) {
    const res = await schoolos.homerooms({ yearId: schoolosYearId, grade });
    for (const room of res.data) {
      for (const t of room.homeroomTeachers) {
        total += 1;
        const teacherId = teacherIdMap.get(t.id);
        if (!teacherId) continue; // advisor not in the mirror (resigned etc.)
        rows.push({ yearId, gradeLevel: room.gradeLevel, classroom: room.classroom, teacherId });
      }
    }
  }

  await db.delete(homerooms).where(eq(homerooms.yearId, yearId));
  if (rows.length > 0) await db.insert(homerooms).values(rows);

  return { created: rows.length, updated: 0, total };
}
