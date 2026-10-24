import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  registrations,
  scheduleBlockDays,
  scheduleBlockRows,
  scheduleBlocks,
  subjectDates,
  subjectSections,
  type ScheduleRowSource,
} from '@/db/schema';
import { trackChoiceRows } from './tracks';

type TrackSource = Extract<ScheduleRowSource, { kind: 'track' }>;

/** What `assignedBy` says on a registration this sync made. */
export const TRACK_ACTOR = 'track-choice';

/**
 * A นักเรียน who chose a สาย (or one แขนง of it) for themselves is registered in
 * the กลุ่มเรียน of every ห้อง of ตารางรอบ that names that Track as where its
 * นักเรียน come from — whoever opened the กลุ่ม, and whenever they chose.
 *
 * Opening a กลุ่ม from a cell only fills it once, at that moment, and only for
 * a ผู้ดูแล: a กลุ่ม opened by a ครู, opened before the ห้อง was linked to its
 * Track, or opened before the นักเรียน had chosen stayed empty for good — and
 * an empty กลุ่ม tells เช็คชื่อ and the API there is nobody to check. This is
 * run wherever those rosters are read or reshaped, so the choice itself is
 * what counts.
 *
 * Only adds. A นักเรียน already in another กลุ่ม of the same วิชา is left
 * there (one กลุ่ม per วิชา), and nobody is taken out: a roster may have been
 * edited by hand on จัดนักเรียนเข้าวิชา, and attendance hangs off it.
 *
 * `date` limits the work to the กลุ่ม meeting that day. Returns how many
 * registrations were added.
 */
export async function syncTrackRosters(yearId: number, date?: string): Promise<number> {
  const rows = (
    await db
      .select({
        blockId: scheduleBlockRows.blockId,
        label: scheduleBlockRows.label,
        source: scheduleBlockRows.source,
      })
      .from(scheduleBlockRows)
      .innerJoin(scheduleBlocks, eq(scheduleBlockRows.blockId, scheduleBlocks.id))
      .where(eq(scheduleBlocks.yearId, yearId))
  ).filter((r): r is typeof r & { source: TrackSource } => r.source?.kind === 'track');
  if (!rows.length) return 0;

  // A กลุ่ม belongs to a ห้อง when it carries the ห้อง's name and meets on a วัน
  // of that ห้อง's รอบ — the same name may be a ห้อง of another รอบ, with
  // another Track, in the other ภาคเรียน.
  const meeting = await db
    .selectDistinct({
      sectionId: subjectSections.id,
      subjectId: subjectSections.subjectId,
      name: subjectSections.name,
      blockId: scheduleBlockDays.blockId,
    })
    .from(subjectDates)
    .innerJoin(subjectSections, eq(subjectDates.sectionId, subjectSections.id))
    .innerJoin(scheduleBlockDays, eq(scheduleBlockDays.date, subjectDates.date))
    .where(
      and(
        eq(subjectSections.yearId, yearId),
        inArray(subjectSections.name, [...new Set(rows.map((r) => r.label))]),
        inArray(scheduleBlockDays.blockId, [...new Set(rows.map((r) => r.blockId))]),
        ...(date ? [eq(subjectDates.date, date)] : []),
      ),
    );
  if (!meeting.length) return 0;

  const chosenBy = new Map<number, Awaited<ReturnType<typeof trackChoiceRows>>>();
  for (const semester of new Set(rows.map((r) => r.source.semester)))
    chosenBy.set(semester, await trackChoiceRows(yearId, semester));

  // sectionId → { subjectId, the นักเรียน who chose its ห้อง's Track }
  const wanted = new Map<number, { subjectId: number; students: Set<number> }>();
  for (const m of meeting) {
    for (const r of rows) {
      if (r.blockId !== m.blockId || r.label !== m.name) continue;
      const { semester, trackId, optionId } = r.source;
      const entry = wanted.get(m.sectionId) ?? { subjectId: m.subjectId, students: new Set() };
      for (const c of chosenBy.get(semester) ?? [])
        if (c.trackId === trackId && (!optionId || c.optionId === optionId))
          entry.students.add(c.studentId);
      wanted.set(m.sectionId, entry);
    }
  }
  if (![...wanted.values()].some((w) => w.students.size)) return 0;

  return db.transaction(async (tx) => {
    // Two requests syncing at once would otherwise both see a นักเรียน missing
    // and register them twice — registrations has no unique key to stop it.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('tracks:track-roster'))`);

    const subjectIds = [...new Set([...wanted.values()].map((w) => w.subjectId))];
    const placed = await tx
      .select({
        subjectId: registrations.subjectId,
        sectionId: registrations.sectionId,
        studentId: registrations.studentId,
        droppedAt: registrations.droppedAt,
      })
      .from(registrations)
      .where(and(eq(registrations.yearId, yearId), inArray(registrations.subjectId, subjectIds)));
    // Sitting in a กลุ่ม of the วิชา already, or once taken out of this very
    // กลุ่ม by hand — that removal was somebody's decision, not a gap to fill.
    const taken = new Set(
      placed.filter((p) => !p.droppedAt).map((p) => `${p.subjectId}:${p.studentId}`),
    );
    const removed = new Set(
      placed.filter((p) => p.droppedAt).map((p) => `${p.sectionId}:${p.studentId}`),
    );

    const values: (typeof registrations.$inferInsert)[] = [];
    for (const [sectionId, { subjectId, students }] of wanted)
      for (const studentId of students) {
        const key = `${subjectId}:${studentId}`;
        if (taken.has(key) || removed.has(`${sectionId}:${studentId}`)) continue;
        taken.add(key);
        values.push({ yearId, subjectId, sectionId, studentId, assignedBy: TRACK_ACTOR });
      }
    if (values.length) await tx.insert(registrations).values(values);
    return values.length;
  });
}
