import { requireRole } from '@/lib/authz';
import { allYears } from '@/lib/years';
import { choiceCountsForTerm, groupCatalog, resolveTerm, tracksForTerm } from '@/lib/tracks';
import { NeedYear } from '@/components/ui';
import { TracksManager } from './tracks-manager';

export const metadata = { title: 'Track' };

/**
 * Track (สายการเรียน) — the ผู้ดูแล's catalogue screen.
 *
 * Everything on it is scoped to one ภาคเรียน, chosen at the top: the offer
 * changes between terms, and a list mixing ปีที่แล้ว with ปีนี้ is a list nobody
 * can read a decision out of. The term is in the URL so a link to it is a link
 * to that ภาคเรียน, and it opens on the newest one that has Tracks set up.
 */
export default async function AdminTracksPage({
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

  const [tracks, counts, groups] = await Promise.all([
    tracksForTerm(term.yearId, term.semester),
    choiceCountsForTerm(term.yearId, term.semester),
    groupCatalog(),
  ]);

  return (
    <TracksManager
      term={term}
      years={years.map((y) => ({ id: y.id, year: y.year }))}
      groups={groups}
      tracks={tracks.map((t) => ({ ...t, chosenCount: counts.get(t.id) ?? 0 }))}
    />
  );
}
