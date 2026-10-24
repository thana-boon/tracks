'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { people, trackChoices, trackOptionRanks, trackOptions, tracks } from '@/db/schema';
import { actorOf, requireRole } from '@/lib/authz';
import { logActivity } from '@/lib/log';
import { latestTerm } from '@/lib/tracks';
import { syncTrackRosters } from '@/lib/track-roster';
import {
  SEMESTERS,
  changeLimitLabel,
  changeStanding,
  rankingProblem,
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
  const { yearId, semester, trackId } = parsed.data;

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

  const [existing] = await db
    .select({
      id: trackChoices.id,
      trackId: trackChoices.trackId,
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
    if (existing.trackId === trackId)
      return { ok: false, message: 'เป็นตัวเลือกเดิมอยู่แล้ว — ไม่มีอะไรเปลี่ยน' };

    // Conditional on the count read above: a second tap racing this one finds
    // it already spent and updates nothing, rather than both succeeding on a
    // single remaining change. The ข้อย่อย — the one the ผู้ดูแล set, and the
    // อันดับ the นักเรียน made — belong to the สาย being left, so they go too.
    const updated = await db.transaction(async (tx) => {
      const rows = await tx
        .update(trackChoices)
        .set({
          trackId,
          optionId: null,
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
      if (rows.length)
        await tx.delete(trackOptionRanks).where(eq(trackOptionRanks.choiceId, existing.id));
      return rows;
    });
    if (!updated.length)
      return { ok: false, message: 'มีการแก้ไขเกิดขึ้นพร้อมกัน — โหลดหน้าใหม่แล้วลองอีกครั้ง' };

    const left = standing.left - 1;
    await logActivity(user, 'change_track_self', `track:${trackId}`, {
      from: existing.heldName,
      track: track.name,
      semester,
      change: existing.studentChanges + 1,
      limit: standing.limit,
    });
    await syncTrackRosters(yearId);
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
      chosenBy: actorOf(user),
    });
  } catch {
    // track_choices_term_student_uq — two taps, one row. The second one is not
    // an error worth a stack trace; it is the rule doing its job.
    return { ok: false, message: 'บันทึกการเลือกไปแล้ว — โหลดหน้าใหม่เพื่อดูผล' };
  }

  await logActivity(user, 'choose_track', `track:${trackId}`, {
    track: track.name,
    semester,
  });
  await syncTrackRosters(yearId);
  revalidateAll();
  return {
    ok: true,
    message: `เลือก “${track.name}” เรียบร้อยแล้ว — ${changeLimitLabel(track.changeLimit)}`,
  };
}

const RankInput = z.object({
  yearId: z.number().int().positive(),
  semester: z.number().int().refine((n) => SEMESTERS.includes(n as 1 | 2), 'ภาคเรียนไม่ถูกต้อง'),
  /** option ids, อันดับ 1 first */
  ranked: z.array(z.number().int().positive()).max(30),
});

/**
 * A นักเรียน ranking the ข้อย่อย of the สาย they hold — as often as they like
 * while the ผู้ดูแล has ranking open; the switch is the deadline.
 *
 * The สาย is read off their own choice row, never taken from the form: only
 * someone who holds the สาย may rank its ข้อย่อย, and a form that named the
 * track would let anybody rank any of them.
 */
export async function rankOptions(form: z.infer<typeof RankInput>): Promise<ActionResult> {
  const user = await requireRole('student');
  if (!user.personId) return { ok: false, message: 'ไม่พบข้อมูลนักเรียน — ติดต่อฝ่ายวิชาการ' };

  const parsed = RankInput.safeParse(form);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' };
  const { yearId, semester, ranked } = parsed.data;

  const open = await latestTerm();
  if (!open || open.yearId !== yearId || open.semester !== semester)
    return { ok: false, message: 'จัดอันดับได้เฉพาะภาคเรียนที่เปิดอยู่' };

  const [held] = await db
    .select({
      choiceId: trackChoices.id,
      trackId: tracks.id,
      trackName: tracks.name,
      rankingOpen: tracks.rankingOpen,
      rankingRequireAll: tracks.rankingRequireAll,
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
  if (!held) return { ok: false, message: 'เลือก Track ก่อน แล้วจึงจัดอันดับข้อย่อยได้' };
  if (!held.rankingOpen)
    return { ok: false, message: `“${held.trackName}” ยังไม่เปิดให้จัดอันดับข้อย่อย หรือปิดไปแล้ว` };

  const opts = await db
    .select({ id: trackOptions.id })
    .from(trackOptions)
    .where(and(eq(trackOptions.trackId, held.trackId), eq(trackOptions.active, true)));
  const problem = rankingProblem(
    ranked,
    opts.map((o) => o.id),
    held.rankingRequireAll,
  );
  if (problem) return { ok: false, message: problem };

  // Replace, not merge: the list on screen is the whole ranking.
  await db.transaction(async (tx) => {
    await tx.delete(trackOptionRanks).where(eq(trackOptionRanks.choiceId, held.choiceId));
    await tx
      .insert(trackOptionRanks)
      .values(ranked.map((optionId, i) => ({ choiceId: held.choiceId, rank: i + 1, optionId })));
  });

  await logActivity(user, 'rank_track_options', `track:${held.trackId}`, {
    track: held.trackName,
    ranked,
    semester,
  });
  revalidateAll();
  return { ok: true, message: `บันทึกอันดับข้อย่อย ${ranked.length} อันดับแล้ว` };
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
