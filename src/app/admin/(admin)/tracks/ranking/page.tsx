import { requireRole } from '@/lib/authz';
import { allYears } from '@/lib/years';
import { resolveTerm, studentsWithChoice, tracksForTerm } from '@/lib/tracks';
import { scoreBookFor } from '@/lib/score-api';
import { isTrackGrade } from '@/lib/utils';
import { NeedYear } from '@/components/ui';
import { RankingView, type RankStudent, type RankTrack } from './ranking-view';

export const metadata = { title: 'จัดอันดับคะแนนสอบ' };

/**
 * จัดอันดับคะแนนสอบ — กลางภาค/ปลายภาค from the SchoolOS score service, summed
 * over whichever ช่วงสอบ and วิชา the ผู้ดูแล ticks, and ranked inside one
 * Track (or ข้อย่อย) or across a whole ชั้น.
 *
 * The ภาคเรียน on this page is the one whose Track choices decide who is in
 * which สาย; the scores are the whole ปีการศึกษา, both ภาคเรียน, and which of
 * them count is a tick on the screen.
 */
export default async function ScoreRankingPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; semester?: string }>;
}) {
  await requireRole('admin');
  const sp = await searchParams;
  const years = await allYears();
  if (!years.length) return <NeedYear />;

  const term = await resolveTerm(Number(sp.year) || null, Number(sp.semester) || null);
  if (!term) return <NeedYear />;

  const [defined, roster, load] = await Promise.all([
    tracksForTerm(term.yearId, term.semester),
    studentsWithChoice(term),
    scoreBookFor(term.year),
  ]);

  const tracks: RankTrack[] = defined.map((t) => ({
    id: t.id,
    name: t.name,
    options: t.options.map((o) => ({ id: o.id, name: o.name })),
  }));

  const book = load.ok ? load.book : null;
  const students: RankStudent[] = roster
    .filter((s) => isTrackGrade(s.gradeLevel))
    .map(({ chosenBy: _c, changedBy: _ch, ...s }) => ({
      ...s,
      cells: book?.byCode[s.code] ?? [],
    }));

  return (
    <RankingView
      term={term}
      years={years.map((y) => ({ id: y.id, year: y.year }))}
      tracks={tracks}
      students={students}
      periods={book?.periods ?? []}
      subjects={book?.subjects ?? []}
      fetchedAt={book?.fetchedAt ?? null}
      error={load.ok ? null : load}
    />
  );
}
