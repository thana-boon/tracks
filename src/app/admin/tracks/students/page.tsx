import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { people, trackChoices } from '@/db/schema';
import { requireRole } from '@/lib/authz';
import { allYears } from '@/lib/years';
import { resolveTerm, tracksForTerm } from '@/lib/tracks';
import { NeedYear } from '@/components/ui';
import { ChoicesManager, type ChoiceStudent } from './choices-manager';

export const metadata = { title: 'การเลือก Track ของนักเรียน' };

/**
 * Who chose what, and the only place a choice can be changed after the student
 * made it. Every นักเรียน of the ชั้น shows up, chosen or not: the question this
 * screen exists to answer is "ใครยังไม่เลือก", which a list of choices alone
 * cannot answer.
 */
export default async function TrackChoicesPage({
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

  const [tracks, students, choices] = await Promise.all([
    tracksForTerm(term.yearId, term.semester),
    db
      .select({
        id: people.id,
        code: people.code,
        fullName: people.fullName,
        nickname: people.nickname,
        gradeLevel: people.gradeLevel,
        classroom: people.classroom,
        classNumber: people.classNumber,
      })
      .from(people)
      .where(and(eq(people.type, 'student'), eq(people.status, 'studying')))
      .orderBy(asc(people.gradeLevel), asc(people.classroom), asc(people.classNumber)),
    db
      .select({
        studentId: trackChoices.studentId,
        trackId: trackChoices.trackId,
        optionId: trackChoices.optionId,
        chosenBy: trackChoices.chosenBy,
        changedBy: trackChoices.changedBy,
      })
      .from(trackChoices)
      .where(
        and(eq(trackChoices.yearId, term.yearId), eq(trackChoices.semester, term.semester)),
      ),
  ]);

  const byStudent = new Map(choices.map((c) => [c.studentId, c]));
  const rows: ChoiceStudent[] = students.map((s) => {
    const c = byStudent.get(s.id);
    return {
      ...s,
      trackId: c?.trackId ?? null,
      optionId: c?.optionId ?? null,
      /** an admin who set or moved it — shown so an exception is visible as one */
      byAdmin: c ? c.changedBy !== null || c.chosenBy.startsWith('admin:') : false,
    };
  });

  return (
    <ChoicesManager
      term={term}
      years={years.map((y) => ({ id: y.id, year: y.year }))}
      tracks={tracks}
      students={rows}
    />
  );
}
