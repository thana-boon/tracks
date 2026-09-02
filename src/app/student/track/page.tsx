import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { people } from '@/db/schema';
import { requireRole } from '@/lib/authz';
import { EmptyState, NeedYear } from '@/components/ui';
import { Route } from 'lucide-react';
import {
  choiceHistoryOf,
  choiceOf,
  latestTerm,
  listTerms,
  resolveTerm,
  tracksForTerm,
} from '@/lib/tracks';
import { trackAllows } from '@/lib/track-core';
import { TrackChooser } from './track-chooser';

export const metadata = { title: 'เลือก Track' };

/**
 * เลือก Track — the student's own screen.
 *
 * It opens on the ภาคเรียน that is currently offered ("ล่าสุดที่ตั้งไว้"), and
 * that is the only one it will accept a choice for; the other terms in the
 * switcher are the student's own history, read-only. Once a choice exists the
 * page stops offering and starts reporting: changing it is the ผู้ดูแล's job,
 * and the page says so rather than leaving a button that would only fail.
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

  // A ม.4 is not offered the ม.6 สาย — filtering here rather than in the
  // chooser keeps the ineligible ones out of the browser altogether.
  const gradeLevel = student?.gradeLevel ?? null;
  const offered = available.filter((t) => trackAllows(t, gradeLevel));

  // The clock is read once, on the server, and handed down: the chooser renders
  // "ยังไม่เปิด / ปิดรับแล้ว" off it, and a client reading its own `new Date()`
  // would disagree with the server it was rendered on — and with the action
  // that has the final say — by whatever the device's clock is out by.
  const now = new Date().toISOString();

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
          เลือกได้ครั้งเดียวต่อภาคเรียน — เปลี่ยนได้โดยติดต่อผู้ดูแลระบบเท่านั้น
        </p>
        <div className="mt-4 h-0.5 w-10 rounded-full bg-[#F5C518]" />
      </section>

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
                trackName: choice.trackName,
                optionName: choice.optionName,
                chosenAt: choice.chosenAt.toISOString(),
                changedByAdmin: choice.changedAt !== null,
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
