'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { academicYears, people, trackChoices, trackOptions, tracks } from '@/db/schema';
import { actorOf, requireRole } from '@/lib/authz';
import { logActivity } from '@/lib/log';
import { optionProblem } from '@/lib/tracks';
import { GRADE_LEVELS, SEMESTERS, trackAllows, trackWindow } from '@/lib/track-core';
import { fromSchoolDateTimeInput, thaiDateTimeLongOf } from '@/lib/utils';
import type { ActionResult } from '@/components/action-button';

const OptionInput = z.object({
  /** null adds a new ข้อย่อย; an id edits the one it names */
  id: z.number().int().positive().nullable(),
  name: z.string().trim().min(1, 'กรอกชื่อข้อย่อย').max(120),
  description: z.string().trim().max(500).optional().default(''),
});

const TrackInput = z.object({
  yearId: z.number().int().positive(),
  semester: z.number().int().refine((n) => SEMESTERS.includes(n as 1 | 2), 'ภาคเรียนไม่ถูกต้อง'),
  name: z.string().trim().min(1, 'กรอกชื่อ Track').max(120),
  description: z.string().trim().max(500).optional().default(''),
  gradeLevels: z.array(z.string().trim()).max(GRADE_LEVELS.length),
  /** "YYYY-MM-DDTHH:MM" in school time, or '' for "ไม่กำหนด" on that side */
  opensAt: z.string().trim().max(32).optional().default(''),
  closesAt: z.string().trim().max(32).optional().default(''),
  options: z.array(OptionInput).max(30),
});

export type TrackInputForm = z.infer<typeof TrackInput>;

/** Thrown inside the transaction so a refusal rolls the whole save back. */
class ChoiceInUse extends Error {}

/**
 * Save a Track and its ข้อย่อย in one go.
 *
 * One action rather than a separate screen per ข้อย่อย: a สาย and its แขนง are
 * only meaningful together — "TrackSM" with its กฎหมาย/บริหาร half-saved is a
 * list students would be offered mid-edit.
 */
export async function saveTrack(id: number | null, form: TrackInputForm): Promise<ActionResult> {
  const user = await requireRole('admin');
  const parsed = TrackInput.safeParse(form);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' };
  const { yearId, semester, name, description, gradeLevels, options } = parsed.data;

  // ช่วงเวลาเปิด-ปิด. Either side may be left blank — an unfenced side means
  // "ไม่กำหนด", not "now". A blank string has to survive as null rather than
  // become an Invalid Date, so the parse and the emptiness test are one step.
  const opensAt = parsed.data.opensAt ? fromSchoolDateTimeInput(parsed.data.opensAt) : null;
  const closesAt = parsed.data.closesAt ? fromSchoolDateTimeInput(parsed.data.closesAt) : null;
  if (parsed.data.opensAt && !opensAt) return { ok: false, message: 'เวลาเปิดให้เลือกไม่ถูกต้อง' };
  if (parsed.data.closesAt && !closesAt) return { ok: false, message: 'เวลาปิดรับไม่ถูกต้อง' };
  if (opensAt && closesAt && closesAt <= opensAt)
    return { ok: false, message: 'เวลาปิดรับต้องอยู่หลังเวลาเปิดให้เลือก' };

  const wantedGrades = [...new Set(gradeLevels)];
  const grades = wantedGrades.filter((g) => (GRADE_LEVELS as readonly string[]).includes(g));
  if (grades.length !== wantedGrades.length) return { ok: false, message: 'ระดับชั้นไม่ถูกต้อง' };

  const [year] = await db
    .select({ id: academicYears.id, year: academicYears.year })
    .from(academicYears)
    .where(eq(academicYears.id, yearId))
    .limit(1);
  if (!year) return { ok: false, message: 'ไม่พบปีการศึกษานี้' };

  // Two สาย of one ภาคเรียน sharing a name would be indistinguishable to the
  // student choosing between them.
  const clash = await db
    .select({ id: tracks.id })
    .from(tracks)
    .where(
      and(
        eq(tracks.yearId, yearId),
        eq(tracks.semester, semester),
        eq(tracks.name, name),
        ...(id ? [ne(tracks.id, id)] : []),
      ),
    )
    .limit(1);
  if (clash.length)
    return {
      ok: false,
      message: `ปีการศึกษา ${year.year} ภาคเรียนที่ ${semester} มี “${name}” อยู่แล้ว`,
    };

  const names = options.map((o) => o.name);
  if (new Set(names).size !== names.length) return { ok: false, message: 'ชื่อข้อย่อยซ้ำกัน' };

  // Moving a Track to another ภาคเรียน once students have chosen it would strand
  // their choice rows: those carry their own year/semester, and the two would no
  // longer agree about which term the student is in.
  if (id) {
    const [before] = await db
      .select({ yearId: tracks.yearId, semester: tracks.semester })
      .from(tracks)
      .where(eq(tracks.id, id))
      .limit(1);
    if (!before) return { ok: false, message: 'ไม่พบ Track นี้' };
    if (before.yearId !== yearId || before.semester !== semester) {
      const [{ n } = { n: 0 }] = await db
        .select({ n: sql<number>`count(*)` })
        .from(trackChoices)
        .where(eq(trackChoices.trackId, id));
      if (Number(n) > 0)
        return {
          ok: false,
          message: `ย้ายภาคเรียนไม่ได้: มีนักเรียนเลือก Track นี้แล้ว ${n} คน — สร้าง Track ใหม่ในภาคเรียนนั้นแทน`,
        };
    }
  }

  let trackId = id;
  let removed = 0;

  try {
    await db.transaction(async (tx) => {
      if (trackId) {
        await tx
          .update(tracks)
          .set({
            yearId,
            semester,
            name,
            description: description || null,
            gradeLevels: grades,
            opensAt,
            closesAt,
          })
          .where(eq(tracks.id, trackId));
      } else {
        const [created] = await tx
          .insert(tracks)
          .values({
            yearId,
            semester,
            name,
            description: description || null,
            gradeLevels: grades,
            opensAt,
            closesAt,
          })
          .returning({ id: tracks.id });
        trackId = created.id;
      }
      const tid = trackId;

      const current = await tx
        .select({ id: trackOptions.id })
        .from(trackOptions)
        .where(eq(trackOptions.trackId, tid));
      const keep = new Set(options.map((o) => o.id).filter((n): n is number => n !== null));
      const drop = current.map((c) => c.id).filter((cid) => !keep.has(cid));

      if (drop.length) {
        // A ข้อย่อย somebody already picked cannot be dropped — the choice row
        // points at it, and cutting it loose would leave a student in a สาย
        // whose แขนง no longer exists.
        const [{ n } = { n: 0 }] = await tx
          .select({ n: sql<number>`count(*)` })
          .from(trackChoices)
          .where(inArray(trackChoices.optionId, drop));
        if (Number(n) > 0) throw new ChoiceInUse(`ลบข้อย่อยไม่ได้: มีนักเรียนเลือกไว้แล้ว ${n} คน`);
        await tx.delete(trackOptions).where(inArray(trackOptions.id, drop));
        removed = drop.length;
      }

      for (const [i, o] of options.entries()) {
        if (o.id) {
          await tx
            .update(trackOptions)
            .set({ name: o.name, description: o.description || null, sortOrder: i })
            .where(and(eq(trackOptions.id, o.id), eq(trackOptions.trackId, tid)));
        } else {
          await tx.insert(trackOptions).values({
            trackId: tid,
            name: o.name,
            description: o.description || null,
            sortOrder: i,
          });
        }
      }
    });
  } catch (e) {
    if (e instanceof ChoiceInUse) return { ok: false, message: e.message };
    throw e;
  }

  await logActivity(user, id ? 'update_track' : 'create_track', `track:${trackId}`, {
    name,
    year: year.year,
    semester,
    gradeLevels: grades,
    opensAt: opensAt?.toISOString(),
    closesAt: closesAt?.toISOString(),
    options: options.length,
    removedOptions: removed,
  });
  revalidatePath('/admin/tracks');
  revalidatePath('/admin/tracks/students');
  // The window is read back in the toast rather than assumed: an admin who
  // mistyped the year finds out here, not when นักเรียน cannot get in.
  const windowNote = opensAt
    ? closesAt
      ? ` — เปิดให้เลือก ${thaiDateTimeLongOf(opensAt)} ถึง ${thaiDateTimeLongOf(closesAt)}`
      : ` — เปิดให้เลือก ${thaiDateTimeLongOf(opensAt)} เป็นต้นไป`
    : closesAt
      ? ` — เปิดให้เลือกถึง ${thaiDateTimeLongOf(closesAt)}`
      : '';
  return {
    ok: true,
    message: `${id ? 'แก้ไข' : 'สร้าง'} “${name}” แล้ว${
      options.length ? ` — ข้อย่อย ${options.length} รายการ` : ''
    }${windowNote}`,
  };
}

export async function toggleTrack(id: number, active: boolean): Promise<ActionResult> {
  const user = await requireRole('admin');
  await db.update(tracks).set({ active }).where(eq(tracks.id, id));
  await logActivity(user, active ? 'enable_track' : 'disable_track', `track:${id}`);
  revalidatePath('/admin/tracks');
  revalidatePath('/student/track');
  return {
    ok: true,
    message: active
      ? 'เปิดให้เลือก Track นี้แล้ว'
      : 'ปิดไม่ให้เลือก Track นี้แล้ว — ผู้ที่เลือกไปแล้วไม่ถูกกระทบ',
  };
}

export async function deleteTrack(id: number): Promise<ActionResult> {
  const user = await requireRole('admin');
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(trackChoices)
    .where(eq(trackChoices.trackId, id));
  if (Number(n) > 0)
    return {
      ok: false,
      message: `ลบไม่ได้: มีนักเรียนเลือก Track นี้แล้ว ${n} คน — ย้ายนักเรียนออกก่อน หรือปิดไม่ให้เลือกแทน`,
    };
  await db.transaction(async (tx) => {
    await tx.delete(trackOptions).where(eq(trackOptions.trackId, id));
    await tx.delete(tracks).where(eq(tracks.id, id));
  });
  await logActivity(user, 'delete_track', `track:${id}`);
  revalidatePath('/admin/tracks');
  revalidatePath('/admin/tracks/students');
  return { ok: true, message: 'ลบ Track แล้ว' };
}

const ChoiceInput = z.object({
  studentId: z.number().int().positive(),
  yearId: z.number().int().positive(),
  semester: z.number().int().refine((n) => SEMESTERS.includes(n as 1 | 2), 'ภาคเรียนไม่ถูกต้อง'),
  trackId: z.number().int().positive(),
  optionId: z.number().int().positive().nullable(),
});

/**
 * Set or move one student's Track — the admin's half of "เลือกได้ครั้งเดียว".
 *
 * A student cannot reach this: their own action refuses the moment a row
 * exists, so every change after the first one comes through here and lands in
 * the activity log with a name against it.
 */
export async function setStudentChoice(form: z.infer<typeof ChoiceInput>): Promise<ActionResult> {
  const user = await requireRole('admin');
  const parsed = ChoiceInput.safeParse(form);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' };
  const { studentId, yearId, semester, trackId, optionId } = parsed.data;

  const [student] = await db
    .select({ id: people.id, fullName: people.fullName, gradeLevel: people.gradeLevel })
    .from(people)
    .where(and(eq(people.id, studentId), eq(people.type, 'student')))
    .limit(1);
  if (!student) return { ok: false, message: 'ไม่พบนักเรียนคนนี้' };

  const [track] = await db.select().from(tracks).where(eq(tracks.id, trackId)).limit(1);
  if (!track) return { ok: false, message: 'ไม่พบ Track นี้' };
  if (track.yearId !== yearId || track.semester !== semester)
    return { ok: false, message: 'Track นี้ไม่ได้อยู่ในภาคเรียนที่เลือก' };

  const problem = await optionProblem(track, optionId);
  if (problem) return { ok: false, message: problem };

  // Unlike the student's own action, an admin may place someone in a สาย that
  // is closed or outside their ชั้น — that is what an exception is for. It is
  // said out loud in the log rather than silently allowed.
  const offGrade = !trackAllows({ gradeLevels: track.gradeLevels ?? [] }, student.gradeLevel);

  const existing = await db
    .select({ id: trackChoices.id })
    .from(trackChoices)
    .where(
      and(
        eq(trackChoices.studentId, studentId),
        eq(trackChoices.yearId, yearId),
        eq(trackChoices.semester, semester),
      ),
    )
    .limit(1);

  const actor = actorOf(user);
  if (existing.length) {
    await db
      .update(trackChoices)
      .set({ trackId, optionId, changedBy: actor, changedAt: new Date() })
      .where(eq(trackChoices.id, existing[0].id));
  } else {
    await db
      .insert(trackChoices)
      .values({ yearId, semester, studentId, trackId, optionId, chosenBy: actor });
  }

  await logActivity(
    user,
    existing.length ? 'change_track_choice' : 'set_track_choice',
    `student:${studentId}`,
    {
      student: student.fullName,
      track: track.name,
      optionId,
      semester,
      offGrade: offGrade || undefined,
      inactiveTrack: !track.active || undefined,
      outsideWindow:
        trackWindow(
          {
            active: track.active,
            opensAt: track.opensAt?.toISOString() ?? null,
            closesAt: track.closesAt?.toISOString() ?? null,
          },
        ).state !== 'open' || undefined,
    },
  );
  revalidatePath('/admin/tracks/students');
  revalidatePath('/student');
  revalidatePath('/student/track');
  return {
    ok: true,
    message: `${existing.length ? 'เปลี่ยน' : 'บันทึก'} Track ของ ${student.fullName} เป็น “${
      track.name
    }” แล้ว`,
  };
}

/**
 * Take a student's choice away entirely, which is also the only way to hand the
 * pick back to them: with no row, their own screen opens again.
 */
export async function clearStudentChoice(
  studentId: number,
  yearId: number,
  semester: number,
): Promise<ActionResult> {
  const user = await requireRole('admin');
  const [student] = await db
    .select({ fullName: people.fullName })
    .from(people)
    .where(eq(people.id, studentId))
    .limit(1);

  await db
    .delete(trackChoices)
    .where(
      and(
        eq(trackChoices.studentId, studentId),
        eq(trackChoices.yearId, yearId),
        eq(trackChoices.semester, semester),
      ),
    );
  await logActivity(user, 'clear_track_choice', `student:${studentId}`, {
    student: student?.fullName,
    semester,
  });
  revalidatePath('/admin/tracks/students');
  revalidatePath('/student');
  revalidatePath('/student/track');
  return {
    ok: true,
    message: `ล้าง Track ของ ${student?.fullName ?? 'นักเรียน'} แล้ว — นักเรียนเลือกใหม่ได้`,
  };
}
