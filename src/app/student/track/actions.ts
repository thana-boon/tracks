'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { people, trackChoices, tracks } from '@/db/schema';
import { actorOf, requireRole } from '@/lib/authz';
import { logActivity } from '@/lib/log';
import { latestTerm, optionProblem } from '@/lib/tracks';
import { SEMESTERS, trackAllows, trackWindow } from '@/lib/track-core';
import { thaiDateTimeLongOf } from '@/lib/utils';
import type { ActionResult } from '@/components/action-button';

const ChooseInput = z.object({
  yearId: z.number().int().positive(),
  semester: z.number().int().refine((n) => SEMESTERS.includes(n as 1 | 2), 'ภาคเรียนไม่ถูกต้อง'),
  trackId: z.number().int().positive(),
  optionId: z.number().int().positive().nullable(),
});

/**
 * A student choosing their own Track — once, for the ภาคเรียน that is open.
 *
 * "เลือกได้ครั้งเดียว" is enforced twice on purpose: the check below gives the
 * student a sentence they can act on, and the unique index behind it is what
 * actually holds when two taps land at the same moment. Everything after the
 * first choice goes through the ผู้ดูแล screen instead, so a change always has a
 * name against it in the log.
 */
export async function chooseTrack(form: z.infer<typeof ChooseInput>): Promise<ActionResult> {
  const user = await requireRole('student');
  if (!user.personId) return { ok: false, message: 'ไม่พบข้อมูลนักเรียน — ติดต่อผู้ดูแล' };

  const parsed = ChooseInput.safeParse(form);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' };
  const { yearId, semester, trackId, optionId } = parsed.data;

  // Only the ภาคเรียน the school is currently offering can be chosen in. Past
  // terms are readable on the same screen, but a choice there would be a
  // history entry written after the fact.
  const open = await latestTerm();
  if (!open || open.yearId !== yearId || open.semester !== semester)
    return { ok: false, message: 'เลือกได้เฉพาะภาคเรียนที่เปิดให้เลือกอยู่' };

  const [student] = await db
    .select({ gradeLevel: people.gradeLevel })
    .from(people)
    .where(eq(people.id, user.personId))
    .limit(1);
  if (!student) return { ok: false, message: 'ไม่พบข้อมูลนักเรียน — ติดต่อผู้ดูแล' };

  const [track] = await db.select().from(tracks).where(eq(tracks.id, trackId)).limit(1);
  if (!track) return { ok: false, message: 'ไม่พบ Track นี้' };
  if (track.yearId !== yearId || track.semester !== semester)
    return { ok: false, message: 'Track นี้ไม่ได้อยู่ในภาคเรียนที่เปิดให้เลือก' };
  if (!track.active) return { ok: false, message: `“${track.name}” ปิดไม่ให้เลือกแล้ว` };

  // ช่วงเวลาเปิด-ปิด. Checked here and not only on the screen: the window is the
  // school's deadline, and a tab left open since before it closed would
  // otherwise post a choice through it. The refusal names the time so a
  // นักเรียน who is early knows when to come back rather than only that they
  // cannot.
  const timing = trackWindow(
    {
      active: track.active,
      opensAt: track.opensAt?.toISOString() ?? null,
      closesAt: track.closesAt?.toISOString() ?? null,
    },
    new Date(),
  );
  if (timing.state === 'before')
    return {
      ok: false,
      message: `“${track.name}” ยังไม่เปิดให้เลือก — เปิด ${thaiDateTimeLongOf(timing.opensAt)} น.`,
    };
  if (timing.state === 'after')
    return {
      ok: false,
      message: `หมดเวลาเลือก “${track.name}” แล้ว (ปิดรับ ${thaiDateTimeLongOf(
        timing.closesAt,
      )} น.) — ติดต่อผู้ดูแลระบบ`,
    };
  if (!trackAllows({ gradeLevels: track.gradeLevels ?? [] }, student.gradeLevel))
    return { ok: false, message: `“${track.name}” ไม่ได้เปิดให้ ${student.gradeLevel ?? 'ระดับชั้นของคุณ'}` };

  const problem = await optionProblem(track, optionId);
  if (problem) return { ok: false, message: problem };

  const existing = await db
    .select({ id: trackChoices.id })
    .from(trackChoices)
    .where(
      and(
        eq(trackChoices.studentId, user.personId),
        eq(trackChoices.yearId, yearId),
        eq(trackChoices.semester, semester),
      ),
    )
    .limit(1);
  if (existing.length) return { ok: false, message: ALREADY_CHOSEN };

  try {
    await db.insert(trackChoices).values({
      yearId,
      semester,
      studentId: user.personId,
      trackId,
      optionId,
      chosenBy: actorOf(user),
    });
  } catch {
    // track_choices_term_student_uq — two taps, one row. The second one is not
    // an error worth a stack trace; it is the rule doing its job.
    return { ok: false, message: ALREADY_CHOSEN };
  }

  await logActivity(user, 'choose_track', `track:${trackId}`, {
    track: track.name,
    optionId,
    semester,
  });
  revalidatePath('/student');
  revalidatePath('/student/track');
  revalidatePath('/admin/tracks/students');
  return { ok: true, message: `เลือก “${track.name}” เรียบร้อยแล้ว` };
}

const ALREADY_CHOSEN =
  'คุณเลือก Track ของภาคเรียนนี้ไปแล้ว — เปลี่ยนได้โดยติดต่อผู้ดูแลระบบเท่านั้น';
