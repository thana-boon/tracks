import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { people, tracks } from '@/db/schema';
import { requireRole } from '@/lib/authz';
import { EmptyState, NeedYear } from '@/components/ui';
import { MessageCircleQuestion, Route } from 'lucide-react';
import {
  choiceHistoryOf,
  choiceOf,
  latestTerm,
  listTerms,
  resolveTerm,
  tracksForTerm,
} from '@/lib/tracks';
import { ADVICE_NOTE, changeStanding, choiceByAdmin, trackAllows } from '@/lib/track-core';
import { TrackChooser } from './track-chooser';

export const metadata = { title: 'เลือก Track' };

/**
 * เลือก Track — the student's own screen.
 *
 * It opens on the ภาคเรียน that is currently offered ("ล่าสุดที่ตั้งไว้"), and
 * that is the only one it will accept a choice for; the other terms in the
 * switcher are the student's own history, read-only. Once a choice exists the
 * page reports it, with how many changes the held สาย still allows — and offers
 * the list again only while one is left, rather than a button that would only
 * fail.
 */
export default async function StudentTrackPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; semester?: string }>;
}) {
  const user = await requireRole('student');
  if (!user.personId)
    return <EmptyState title="ไม่พบข้อมูลนักเรียน" hint="ติดต่อผู้ดูแล" />;

  const sp = await searchParams;
  const [open, terms] = await Promise.all([latestTerm(), listTerms()]);
  if (!open) return <NeedYear />;

  const term = (await resolveTerm(Number(sp.year) || null, Number(sp.semester) || null)) ?? open;
  const isOpenTerm = term.yearId === open.yearId && term.semester === open.semester;

  const [student] = await db
    .select({ gradeLevel: people.gradeLevel })
    .from(people)
    .where(eq(people.id, user.personId))
    .limit(1);

  const [available, choice, history] = await Promise.all([
    tracksForTerm(term.yearId, term.semester, { activeOnly: true }),
    choiceOf(user.personId, term.yearId, term.semester),
    choiceHistoryOf(user.personId),
  ]);

  // The held สาย is read on its own rather than out of `available`: it may
  // since have been closed to new choices, and its limit still governs.
  const [held] = choice
    ? await db
        .select({
          changeLimit: tracks.changeLimit,
          changesOpen: tracks.changesOpen,
          opensAt: tracks.opensAt,
          closesAt: tracks.closesAt,
          active: tracks.active,
        })
        .from(tracks)
        .where(eq(tracks.id, choice.trackId))
        .limit(1)
    : [];

  // A ม.4 is not offered the ม.6 สาย — filtering here rather than in the
  // chooser keeps the ineligible ones out of the browser altogether.
  const gradeLevel = student?.gradeLevel ?? null;
  const offered = available.filter((t) => trackAllows(t, gradeLevel));

  // The clock is read once, on the server, and handed down: the chooser renders
  // "ยังไม่เปิด / ปิดรับแล้ว" off it, and a client reading its own `new Date()`
  // would disagree with the server it was rendered on — and with the action
  // that has the final say — by whatever the device's clock is out by.
  const now = new Date().toISOString();

  const standing =
    choice && held
      ? changeStanding(
          {
            ...held,
            opensAt: held.opensAt?.toISOString() ?? null,
            closesAt: held.closesAt?.toISOString() ?? null,
          },
          choice.studentChanges,
          new Date(now),
        )
      : null;

  // The switcher lists every ภาคเรียน that has Tracks; before the first one
  // exists there is still the open term to name.
  const termOptions = terms.length ? terms : [open];

  return (
    <div className="space-y-6">
      <section className="anim-fade-up overflow-hidden rounded-2xl bg-[#2a1547] p-6 text-white lg:p-7">
        <p className="text-xs font-medium uppercase tracking-wide text-white/60">
          เลือกสายการเรียน
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold">
          <Route className="size-6" strokeWidth={1.8} /> Track
        </h1>
        <p className="mt-1 text-sm text-white/70">
          เลือกได้ภาคเรียนละหนึ่ง Track — แต่ละ Track บอกไว้ว่าเลือกแล้วแก้ไขได้กี่ครั้ง
        </p>
        <div className="mt-4 h-0.5 w-10 rounded-full bg-[#F5C518]" />
      </section>

      <p
        role="note"
        className="flex items-start gap-2.5 rounded-xl border border-[#F5C518]/50 bg-[#F5C518]/10 px-4 py-3 text-sm"
      >
        <MessageCircleQuestion className="mt-0.5 size-4.5 shrink-0" strokeWidth={1.8} />
        {ADVICE_NOTE}
      </p>

      <TrackChooser
        now={now}
        term={term}
        terms={termOptions}
        openTerm={open}
        isOpenTerm={isOpenTerm}
        gradeLevel={gradeLevel}
        tracks={offered}
        choice={
          choice
            ? {
                trackId: choice.trackId,
                optionId: choice.optionId,
                trackName: choice.trackName,
                groupColor: choice.groupColor,
                optionName: choice.optionName,
                chosenAt: choice.chosenAt.toISOString(),
                changedByAdmin: choiceByAdmin(choice.chosenBy, choice.changedBy),
                // Only the open term's choice can be changed; an old one is history.
                change: isOpenTerm ? standing : null,
                changeClosesAt: isOpenTerm ? (held?.closesAt?.toISOString() ?? null) : null,
              }
            : null
        }
        history={history.map((h) => ({
          key: `${h.year}-${h.semester}`,
          year: h.year,
          semester: h.semester,
          trackName: h.trackName,
          optionName: h.optionName,
        }))}
      />
    </div>
  );
}
