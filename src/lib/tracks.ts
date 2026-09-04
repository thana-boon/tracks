import 'server-only';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import {
  academicYears,
  people,
  trackChoices,
  trackGroups,
  trackOptions,
  trackSubjects,
  tracks,
} from '@/db/schema';
import { activeYear } from './years';
import type {
  GroupCatalogRow,
  Term,
  TrackOptionRow,
  TrackRow,
  TrackSubjectRow,
} from './track-core';
import { isSemester, subjectInTrack } from './track-core';
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

/**
 * Tracks defined for one ภาคเรียน — each with its ข้อย่อย and with the วิชา a
 * นักเรียน would get by choosing it.
 *
 * The วิชา come along rather than being fetched when the detail panel opens:
 * "ถ้าเลือกสายนี้จะได้เรียนอะไร" is the question the screen exists to answer,
 * and one extra query for every สาย a student taps through would answer it
 * slower for no gain — a ภาคเรียน holds a handful of สาย, not hundreds.
 */
export async function tracksForTerm(
  yearId: number,
  semester: number,
  opts: { activeOnly?: boolean } = {},
): Promise<TrackRow[]> {
  const rows = await db
    .select({
      id: tracks.id,
      yearId: tracks.yearId,
      semester: tracks.semester,
      groupId: tracks.groupId,
      groupCode: trackGroups.code,
      groupName: trackGroups.name,
      phase: tracks.phase,
      name: tracks.name,
      description: tracks.description,
      admissionNote: tracks.admissionNote,
      gradeLevels: tracks.gradeLevels,
      opensAt: tracks.opensAt,
      closesAt: tracks.closesAt,
      active: tracks.active,
    })
    .from(tracks)
    .leftJoin(trackGroups, eq(tracks.groupId, trackGroups.id))
    .where(
      opts.activeOnly
        ? and(eq(tracks.yearId, yearId), eq(tracks.semester, semester), eq(tracks.active, true))
        : and(eq(tracks.yearId, yearId), eq(tracks.semester, semester)),
    )
    .orderBy(asc(tracks.name));
  if (!rows.length) return [];

  const options = await db
    .select({
      id: trackOptions.id,
      trackId: trackOptions.trackId,
      groupId: trackOptions.groupId,
      groupName: trackGroups.name,
      name: trackOptions.name,
      description: trackOptions.description,
      sortOrder: trackOptions.sortOrder,
      active: trackOptions.active,
    })
    .from(trackOptions)
    .leftJoin(trackGroups, eq(trackOptions.groupId, trackGroups.id))
    .where(inArray(trackOptions.trackId, rows.map((r) => r.id)))
    .orderBy(asc(trackOptions.sortOrder), asc(trackOptions.name));

  // Every กลุ่มวิชา the term touches, สาย and แขนง together, in one query — the
  // same กลุ่ม is often behind several of them.
  const groupIds = [
    ...new Set(
      [...rows.map((r) => r.groupId), ...options.map((o) => o.groupId)].filter(
        (id): id is number => id !== null,
      ),
    ),
  ];
  const byGroup = new Map<number, TrackSubjectRow[]>();
  if (groupIds.length) {
    const subjects = await db
      .select({
        id: trackSubjects.id,
        groupId: trackSubjects.groupId,
        code: trackSubjects.code,
        name: trackSubjects.name,
        description: trackSubjects.description,
        teacherName: trackSubjects.teacherName,
        semester: trackSubjects.semester,
        phase: trackSubjects.phase,
      })
      .from(trackSubjects)
      .where(and(inArray(trackSubjects.groupId, groupIds), eq(trackSubjects.active, true)))
      .orderBy(asc(trackSubjects.phase), asc(trackSubjects.code));
    for (const { groupId, ...s } of subjects) {
      const list = byGroup.get(groupId) ?? [];
      list.push(s);
      byGroup.set(groupId, list);
    }
  }

  /** วิชาของกลุ่มหนึ่ง ที่ตรงกับภาคเรียนและช่วงของสาย */
  const subjectsOf = (groupId: number | null, track: { semester: number; phase: number | null }) =>
    groupId === null
      ? []
      : (byGroup.get(groupId) ?? []).filter((s) => subjectInTrack(track, s));

  const byTrack = new Map<number, TrackOptionRow[]>();
  for (const o of options) {
    if (opts.activeOnly && !o.active) continue;
    const track = rows.find((r) => r.id === o.trackId);
    if (!track) continue;
    const list = byTrack.get(o.trackId) ?? [];
    list.push({
      id: o.id,
      groupId: o.groupId,
      groupName: o.groupName,
      name: o.name,
      description: o.description,
      sortOrder: o.sortOrder,
      active: o.active,
      subjects: subjectsOf(o.groupId, track),
    });
    byTrack.set(o.trackId, list);
  }

  return rows.map((t) => ({
    id: t.id,
    yearId: t.yearId,
    semester: t.semester,
    groupId: t.groupId,
    groupCode: t.groupCode,
    groupName: t.groupName,
    phase: t.phase,
    name: t.name,
    description: t.description,
    admissionNote: t.admissionNote,
    gradeLevels: t.gradeLevels ?? [],
    opensAt: t.opensAt?.toISOString() ?? null,
    closesAt: t.closesAt?.toISOString() ?? null,
    active: t.active,
    options: byTrack.get(t.id) ?? [],
    subjects: subjectsOf(t.groupId, t),
  }));
}

/**
 * กลุ่มวิชาทั้งหมดที่ยังเปิดอยู่ พร้อมวิชาในกลุ่ม — the catalogue the สร้าง Track
 * form draws from.
 *
 * The whole thing is sent to the form rather than fetched per กลุ่ม on change:
 * the admin is comparing กลุ่ม against กลุ่ม while deciding, and the preview of
 * "วิชาที่นักเรียนจะได้เจอ" has to appear the moment they pick one.
 */
export async function groupCatalog(): Promise<GroupCatalogRow[]> {
  const [groups, subjects] = await Promise.all([
    db
      .select({
        id: trackGroups.id,
        code: trackGroups.code,
        name: trackGroups.name,
        description: trackGroups.description,
      })
      .from(trackGroups)
      .where(eq(trackGroups.active, true))
      .orderBy(asc(trackGroups.code)),
    db
      .select({
        id: trackSubjects.id,
        groupId: trackSubjects.groupId,
        code: trackSubjects.code,
        name: trackSubjects.name,
        description: trackSubjects.description,
        teacherName: trackSubjects.teacherName,
        semester: trackSubjects.semester,
        phase: trackSubjects.phase,
      })
      .from(trackSubjects)
      .where(eq(trackSubjects.active, true))
      .orderBy(asc(trackSubjects.phase), asc(trackSubjects.code)),
  ]);
  const byGroup = new Map<number, TrackSubjectRow[]>();
  for (const { groupId, ...s } of subjects) {
    const list = byGroup.get(groupId) ?? [];
    list.push(s);
    byGroup.set(groupId, list);
  }
  return groups.map((g) => ({ ...g, subjects: byGroup.get(g.id) ?? [] }));
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
