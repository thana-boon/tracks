import 'server-only';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { academicYears, people, trackChoices, trackOptions, tracks } from '@/db/schema';
import { activeYear } from './years';
import type { Term, TrackOptionRow, TrackRow } from './track-core';
import { isSemester } from './track-core';
import { buildTrackReport, type ReportStudent, type TrackReport } from './track-report';

/**
 * Track (สายการเรียน) — the reading side. The constants, types and pure
 * predicates live in track-core.ts, which client components may import;
 * everything here touches the database. Writes live in the two actions.ts
 * files that own them (admin/tracks and student/track).
 */
export * from './track-core';

/** Every ภาคเรียน that has a Track defined in it, newest first. */
export async function listTerms(): Promise<Term[]> {
  const rows = await db
    .selectDistinct({
      yearId: tracks.yearId,
      year: academicYears.year,
      semester: tracks.semester,
    })
    .from(tracks)
    .innerJoin(academicYears, eq(tracks.yearId, academicYears.id))
    .orderBy(desc(academicYears.year), desc(tracks.semester));
  return rows;
}

/**
 * The ภาคเรียน a screen opens on: the newest one anybody has set Tracks up for.
 *
 * Deliberately read off the Tracks themselves rather than a setting somebody
 * has to remember to move — "ล่าสุดที่ตั้งไว้" is exactly what the admin last
 * created, and a term with no Track in it has nothing to show anyway. Falls
 * back to ภาคเรียนที่ 1 of the active year so the admin screen still opens on
 * something the very first time.
 */
export async function latestTerm(): Promise<Term | null> {
  const [t] = await listTerms();
  if (t) return t;
  const y = await activeYear();
  return y ? { yearId: y.id, year: y.year, semester: 1 } : null;
}

/** The term a `?year=&semester=` pair asks for, or the latest one. */
export async function resolveTerm(
  yearId?: number | null,
  semester?: number | null,
): Promise<Term | null> {
  if (yearId && isSemester(semester)) {
    const [y] = await db
      .select({ id: academicYears.id, year: academicYears.year })
      .from(academicYears)
      .where(eq(academicYears.id, yearId))
      .limit(1);
    if (y) return { yearId: y.id, year: y.year, semester };
  }
  return latestTerm();
}

/** Tracks defined for one ภาคเรียน, each with its ข้อย่อย. */
export async function tracksForTerm(
  yearId: number,
  semester: number,
  opts: { activeOnly?: boolean } = {},
): Promise<TrackRow[]> {
  const rows = await db
    .select()
    .from(tracks)
    .where(
      opts.activeOnly
        ? and(eq(tracks.yearId, yearId), eq(tracks.semester, semester), eq(tracks.active, true))
        : and(eq(tracks.yearId, yearId), eq(tracks.semester, semester)),
    )
    .orderBy(asc(tracks.name));
  if (!rows.length) return [];

  const options = await db
    .select()
    .from(trackOptions)
    .where(inArray(trackOptions.trackId, rows.map((r) => r.id)))
    .orderBy(asc(trackOptions.sortOrder), asc(trackOptions.name));
  const byTrack = new Map<number, TrackOptionRow[]>();
  for (const o of options) {
    if (opts.activeOnly && !o.active) continue;
    const list = byTrack.get(o.trackId) ?? [];
    list.push({
      id: o.id,
      name: o.name,
      description: o.description,
      sortOrder: o.sortOrder,
      active: o.active,
    });
    byTrack.set(o.trackId, list);
  }

  return rows.map((t) => ({
    id: t.id,
    yearId: t.yearId,
    semester: t.semester,
    name: t.name,
    description: t.description,
    gradeLevels: t.gradeLevels ?? [],
    opensAt: t.opensAt?.toISOString() ?? null,
    closesAt: t.closesAt?.toISOString() ?? null,
    active: t.active,
    options: byTrack.get(t.id) ?? [],
  }));
}

export interface ChoiceRow {
  id: number;
  trackId: number;
  trackName: string;
  optionId: number | null;
  optionName: string | null;
  chosenBy: string;
  chosenAt: Date;
  changedBy: string | null;
  changedAt: Date | null;
}

/** What one student picked for one ภาคเรียน, or null. */
export async function choiceOf(
  studentId: number,
  yearId: number,
  semester: number,
): Promise<ChoiceRow | null> {
  const [row] = await db
    .select({
      id: trackChoices.id,
      trackId: trackChoices.trackId,
      trackName: tracks.name,
      optionId: trackChoices.optionId,
      optionName: trackOptions.name,
      chosenBy: trackChoices.chosenBy,
      chosenAt: trackChoices.chosenAt,
      changedBy: trackChoices.changedBy,
      changedAt: trackChoices.changedAt,
    })
    .from(trackChoices)
    .innerJoin(tracks, eq(trackChoices.trackId, tracks.id))
    .leftJoin(trackOptions, eq(trackChoices.optionId, trackOptions.id))
    .where(
      and(
        eq(trackChoices.studentId, studentId),
        eq(trackChoices.yearId, yearId),
        eq(trackChoices.semester, semester),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Every ภาคเรียน one student has ever chosen in, newest first — their ประวัติ. */
export async function choiceHistoryOf(studentId: number): Promise<
  (ChoiceRow & { year: string; semester: number })[]
> {
  return db
    .select({
      id: trackChoices.id,
      trackId: trackChoices.trackId,
      trackName: tracks.name,
      optionId: trackChoices.optionId,
      optionName: trackOptions.name,
      chosenBy: trackChoices.chosenBy,
      chosenAt: trackChoices.chosenAt,
      changedBy: trackChoices.changedBy,
      changedAt: trackChoices.changedAt,
      year: academicYears.year,
      semester: trackChoices.semester,
    })
    .from(trackChoices)
    .innerJoin(tracks, eq(trackChoices.trackId, tracks.id))
    .innerJoin(academicYears, eq(trackChoices.yearId, academicYears.id))
    .leftJoin(trackOptions, eq(trackChoices.optionId, trackOptions.id))
    .where(eq(trackChoices.studentId, studentId))
    .orderBy(desc(academicYears.year), desc(trackChoices.semester));
}

/** How many students picked each track in a term — for the admin list. */
export async function choiceCountsForTerm(
  yearId: number,
  semester: number,
): Promise<Map<number, number>> {
  const rows = await db
    .select({ trackId: trackChoices.trackId })
    .from(trackChoices)
    .where(and(eq(trackChoices.yearId, yearId), eq(trackChoices.semester, semester)));
  const counts = new Map<number, number>();
  for (const r of rows) counts.set(r.trackId, (counts.get(r.trackId) ?? 0) + 1);
  return counts;
}

/**
 * Whether a ข้อย่อย fits the track: required when the track has any, absent
 * when it has none, and always one of *this* track's. Returns the reason it
 * does not, or null.
 *
 * Lives here rather than beside either caller because the นักเรียน screen and
 * the ผู้ดูแล screen have to apply the identical rule — a สาย that demands a
 * แขนง from one of them and not the other is a half-made choice in the table.
 */
export async function optionProblem(
  track: { id: number; name: string },
  optionId: number | null,
): Promise<string | null> {
  const opts = await db
    .select({ id: trackOptions.id })
    .from(trackOptions)
    .where(eq(trackOptions.trackId, track.id));
  if (!opts.length) return optionId ? `“${track.name}” ไม่มีข้อย่อยให้เลือก` : null;
  if (!optionId) return `เลือกข้อย่อยของ “${track.name}” ด้วย`;
  return opts.some((o) => o.id === optionId) ? null : 'ไม่พบข้อย่อยนี้ใน Track ที่เลือก';
}

/**
 * Everything the รายงานสรุป of one ภาคเรียน needs, in two queries.
 *
 * Every studying นักเรียน is in the list, not only those who chose — "ใครยัง
 * ไม่เลือก" is one of the four questions the report exists to answer, and a
 * left join is the only shape that can answer it.
 */
export async function trackReportFor(term: Term): Promise<TrackReport> {
  const [defined, rows] = await Promise.all([
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
        trackId: trackChoices.trackId,
        trackName: tracks.name,
        optionId: trackChoices.optionId,
        optionName: trackOptions.name,
        chosenBy: trackChoices.chosenBy,
        changedBy: trackChoices.changedBy,
      })
      .from(people)
      .leftJoin(
        trackChoices,
        and(
          eq(trackChoices.studentId, people.id),
          eq(trackChoices.yearId, term.yearId),
          eq(trackChoices.semester, term.semester),
        ),
      )
      .leftJoin(tracks, eq(trackChoices.trackId, tracks.id))
      .leftJoin(trackOptions, eq(trackChoices.optionId, trackOptions.id))
      .where(and(eq(people.type, 'student'), eq(people.status, 'studying')))
      .orderBy(asc(people.gradeLevel), asc(people.classroom), asc(people.classNumber)),
  ]);

  const students: ReportStudent[] = rows.map(({ chosenBy, changedBy, ...s }) => ({
    ...s,
    byAdmin: chosenBy !== null && (changedBy !== null || chosenBy.startsWith('admin:')),
  }));
  return buildTrackReport(term, defined, students);
}

/**
 * Who chose what in one ภาคเรียน, as bare ids — the rows the
 * จัดนักเรียนเข้าวิชา screen turns into 'ดึงจาก Track' chips.
 *
 * Ids only, and the ข้อย่อย alongside the สาย: the register screen already
 * holds every นักเรียน by name, and sending the names a second time only gives
 * the two copies a chance to disagree. Students who have left are filtered out
 * here rather than on the screen — a สาย chip that adds someone no longer
 * studying is a roster nobody can explain.
 */
export async function trackChoiceRows(
  yearId: number,
  semester: number,
): Promise<{ trackId: number; optionId: number | null; studentId: number }[]> {
  return db
    .select({
      trackId: trackChoices.trackId,
      optionId: trackChoices.optionId,
      studentId: trackChoices.studentId,
    })
    .from(trackChoices)
    .innerJoin(people, eq(trackChoices.studentId, people.id))
    .where(
      and(
        eq(trackChoices.yearId, yearId),
        eq(trackChoices.semester, semester),
        eq(people.type, 'student'),
        eq(people.status, 'studying'),
      ),
    );
}
