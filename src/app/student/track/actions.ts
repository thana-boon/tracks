'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { people, trackChoices, tracks } from '@/db/schema';
import { actorOf, requireRole } from '@/lib/authz';
import { logActivity } from '@/lib/log';
import { latestTerm, optionProblem } from '@/lib/tracks';
import {
  SEMESTERS,
  changeLimitLabel,
  changeStanding,
  trackAllows,
  trackWindow,
  type ChangeBlock,
} from '@/lib/track-core';
import { thaiDateTimeLongOf } from '@/lib/utils';
import type { ActionResult } from '@/components/action-button';

const ChooseInput = z.object({
  yearId: z.number().int().positive(),
  semester: z.number().int().refine((n) => SEMESTERS.includes(n as 1 | 2), 'ภาคเรียนไม่ถูกต้อง'),
  trackId: z.number().int().positive(),
  optionId: z.number().int().positive().nullable(),
});

/**
 * A student choosing their own Track for the ภาคเรียน that is open — or, if
 * they already hold one, changing it, as many times as that สาย allows.
 *
 * The limit is enforced twice on purpose: the check below gives the student a
 * sentence they can act on, and the conditional update behind it (and the
 * unique index for a first choice) is what actually holds when two taps land
 * at the same moment. Past the limit, a change goes through the ผู้ดูแล screen
 * instead, so it always has a name against it in the log.
 */
export async function chooseTrack(form: z.infer<typeof ChooseInput>): Promise<ActionResult> {
  const user = await requireRole('student');
  if (!user.personId) return { ok: false, message: 'ไม่พบข้อมูลนักเรียน — ติดต่อฝ่ายวิชาการ' };

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
  if (!student) return { ok: false, message: 'ไม่พบข้อมูลนักเรียน — ติดต่อฝ่ายวิชาการ' };

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
      )} น.) — ติดต่อฝ่ายวิชาการ`,
    };
  if (!trackAllows({ gradeLevels: track.gradeLevels ?? [] }, student.gradeLevel))
    return { ok: false, message: `“${track.name}” ไม่ได้เปิดให้ ${student.gradeLevel ?? 'ระดับชั้นของคุณ'}` };

  const problem = await optionProblem(track, optionId);
  if (problem) return { ok: false, message: problem };

  const [existing] = await db
    .select({
      id: trackChoices.id,
      trackId: trackChoices.trackId,
      optionId: trackChoices.optionId,
      studentChanges: trackChoices.studentChanges,
      heldName: tracks.name,
      changeLimit: tracks.changeLimit,
      changesOpen: tracks.changesOpen,
      opensAt: tracks.opensAt,
      closesAt: tracks.closesAt,
      active: tracks.active,
    })
    .from(trackChoices)
    .innerJoin(tracks, eq(trackChoices.trackId, tracks.id))
    .where(
      and(
        eq(trackChoices.studentId, user.personId),
        eq(trackChoices.yearId, yearId),
        eq(trackChoices.semester, semester),
      ),
    )
    .limit(1);

  if (existing) {
    // The สาย they hold decides whether they may leave it — its limit is the
    // number they were shown when they chose it.
    const standing = changeStanding(
      {
        changeLimit: existing.changeLimit,
        changesOpen: existing.changesOpen,
        active: existing.active,
        opensAt: existing.opensAt?.toISOString() ?? null,
        closesAt: existing.closesAt?.toISOString() ?? null,
      },
      existing.studentChanges,
    );
    if (standing.blocked) return { ok: false, message: CANNOT_CHANGE[standing.blocked] };
    if (existing.trackId === trackId && existing.optionId === optionId)
      return { ok: false, message: 'เป็นตัวเลือกเดิมอยู่แล้ว — ไม่มีอะไรเปลี่ยน' };

    // Conditional on the count read above: a second tap racing this one finds
    // it already spent and updates nothing, rather than both succeeding on a
    // single remaining change.
    const updated = await db
      .update(trackChoices)
      .set({
        trackId,
        optionId,
        changedBy: actorOf(user),
        changedAt: new Date(),
        studentChanges: existing.studentChanges + 1,
      })
      .where(
        and(
          eq(trackChoices.id, existing.id),
          eq(trackChoices.studentChanges, existing.studentChanges),
        ),
      )
      .returning({ id: trackChoices.id });
    if (!updated.length)
      return { ok: false, message: 'มีการแก้ไขเกิดขึ้นพร้อมกัน — โหลดหน้าใหม่แล้วลองอีกครั้ง' };

    const left = standing.left - 1;
    await logActivity(user, 'change_track_self', `track:${trackId}`, {
      from: existing.heldName,
      track: track.name,
      optionId,
      semester,
      change: existing.studentChanges + 1,
      limit: standing.limit,
    });
    revalidateAll();
    return {
      ok: true,
      message: `เปลี่ยนเป็น “${track.name}” แล้ว — ${
        left > 0 ? `แก้ไขได้อีก ${left} ครั้ง` : 'ใช้สิทธิ์แก้ไขครบแล้ว'
      }`,
    };
  }

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
    return { ok: false, message: 'บันทึกการเลือกไปแล้ว — โหลดหน้าใหม่เพื่อดูผล' };
  }

  await logActivity(user, 'choose_track', `track:${trackId}`, {
    track: track.name,
    optionId,
    semester,
  });
  revalidateAll();
  return {
    ok: true,
    message: `เลือก “${track.name}” เรียบร้อยแล้ว — ${changeLimitLabel(track.changeLimit)}`,
  };
}

function revalidateAll() {
  revalidatePath('/student');
  revalidatePath('/student/track');
  revalidatePath('/admin/tracks');
  revalidatePath('/admin/tracks/students');
}

/** What the นักเรียน is told when their held สาย will not let them change. */
const CANNOT_CHANGE: Record<ChangeBlock, string> = {
  none: 'Track ที่เลือกไว้กำหนดให้แก้ไขไม่ได้ — ต้องการเปลี่ยน ติดต่อฝ่ายวิชาการ',
  used: 'คุณใช้สิทธิ์แก้ไขครบแล้ว — ต้องการเปลี่ยน ติดต่อฝ่ายวิชาการ',
  frozen: 'ขณะนี้ปิดการแก้ไข Track — รอเปิดอีกครั้ง หรือติดต่อฝ่ายวิชาการ',
  after: 'หมดเวลาแก้ไขแล้ว — ต้องการเปลี่ยน ติดต่อฝ่ายวิชาการ',
};
