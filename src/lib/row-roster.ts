import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  classroomStudents,
  classrooms,
  people,
  registrations,
  scheduleBlockDays,
  scheduleBlockRows,
  scheduleBlocks,
  subjectDates,
  subjectSections,
  type ScheduleRowSource,
} from '@/db/schema';
import { trackChoiceRows } from './tracks';

/** What `assignedBy` says on a registration this sync made. */
export const ROW_ACTOR = 'schedule-row';

/**
 * A ห้อง of ตารางรอบ is a set of นักเรียน, and a วิชา put in one of its cells
 * means *those* นักเรียน study it — so they are registered in that กลุ่มเรียน,
 * whoever pressed the cell and whenever they joined the ห้อง.
 *
 * Who a ห้อง's นักเรียน are comes from where the ห้อง says they come from: a
 * ห้องประจำชั้น, a กลุ่มเรียนพิเศษ, or the นักเรียน who chose a Track (or one
 * แขนง of it) for themselves. A ห้อง that names nothing is matched by its name
 * — a กลุ่มเรียนพิเศษ of that name, or a ห้องประจำชั้น written "ม.4-1".
 *
 * Opening a กลุ่ม from a cell used to fill it once, at that moment, and only
 * for a ผู้ดูแล: a กลุ่ม opened by a ครู, opened before the ห้อง named its
 * นักเรียน, or opened before a นักเรียน joined stayed empty — and an empty
 * กลุ่ม tells เช็คชื่อ and the API there is nobody to check. This runs
 * wherever those rosters are read or reshaped instead.
 *
 * Only adds. A นักเรียน already in another กลุ่ม of the same วิชา is left
 * there (one กลุ่ม per วิชา), one taken out of this กลุ่ม by hand stays out,
 * and nobody is removed: attendance hangs off the roster.
 *
 * `date` limits the work to the กลุ่ม meeting that day. Returns how many
 * registrations were added.
 */
export async function syncRowRosters(yearId: number, date?: string): Promise<number> {
  const rows = await db
    .select({
      blockId: scheduleBlockRows.blockId,
      label: scheduleBlockRows.label,
      source: scheduleBlockRows.source,
    })
    .from(scheduleBlockRows)
    .innerJoin(scheduleBlocks, eq(scheduleBlockRows.blockId, scheduleBlocks.id))
    .where(eq(scheduleBlocks.yearId, yearId));
  if (!rows.length) return 0;

  // A กลุ่ม belongs to a ห้อง when it carries the ห้อง's name and meets on a วัน
  // of that ห้อง's รอบ — the same name may be a ห้อง of another รอบ, with
  // other นักเรียน, in the other ภาคเรียน.
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

  const studentsOf = rosterReader(yearId);
  // sectionId → { subjectId, the นักเรียน of its ห้อง }
  const wanted = new Map<number, { subjectId: number; students: Set<number> }>();
  for (const m of meeting) {
    for (const r of rows) {
      if (r.blockId !== m.blockId || r.label !== m.name) continue;
      const entry = wanted.get(m.sectionId) ?? { subjectId: m.subjectId, students: new Set() };
      for (const id of await studentsOf(r.label, r.source)) entry.students.add(id);
      wanted.set(m.sectionId, entry);
    }
  }
  if (![...wanted.values()].some((w) => w.students.size)) return 0;

  return db.transaction(async (tx) => {
    // Two requests syncing at once would otherwise both see a นักเรียน missing
    // and register them twice — registrations has no unique key to stop it.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('tracks:row-roster'))`);

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
        values.push({ yearId, subjectId, sectionId, studentId, assignedBy: ROW_ACTOR });
      }
    if (values.length) await tx.insert(registrations).values(values);
    return values.length;
  });
}

/**
 * The นักเรียน (still studying) of a ห้อง, looked up once per distinct source
 * however many กลุ่ม share it.
 */
function rosterReader(yearId: number) {
  const cache = new Map<string, Promise<number[]>>();
  const memo = (key: string, load: () => Promise<number[]>) => {
    if (!cache.has(key)) cache.set(key, load());
    return cache.get(key)!;
  };

  const homeroom = (gradeLevel: string, classroom: string) =>
    memo(`home:${gradeLevel}/${classroom}`, async () =>
      (
        await db
          .select({ id: people.id })
          .from(people)
          .where(
            and(
              eq(people.type, 'student'),
              eq(people.status, 'studying'),
              eq(people.gradeLevel, gradeLevel),
              eq(people.classroom, classroom),
            ),
          )
      ).map((p) => p.id),
    );

  const savedGroup = (match: { id: number } | { name: string }) =>
    memo('id' in match ? `room:${match.id}` : `room-name:${match.name}`, async () =>
      (
        await db
          .select({ id: classroomStudents.studentId })
          .from(classroomStudents)
          .innerJoin(classrooms, eq(classroomStudents.classroomId, classrooms.id))
          .innerJoin(people, eq(classroomStudents.studentId, people.id))
          .where(
            and(
              eq(classrooms.yearId, yearId),
              'id' in match ? eq(classrooms.id, match.id) : eq(classrooms.name, match.name),
              eq(people.status, 'studying'),
            ),
          )
      ).map((p) => p.id),
    );

  const chosen = new Map<number, ReturnType<typeof trackChoiceRows>>();
  const track = (s: Extract<ScheduleRowSource, { kind: 'track' }>) => {
    if (!chosen.has(s.semester)) chosen.set(s.semester, trackChoiceRows(yearId, s.semester));
    return memo(`track:${s.semester}:${s.trackId}:${s.optionId ?? ''}`, async () =>
      (await chosen.get(s.semester)!)
        .filter((c) => c.trackId === s.trackId && (!s.optionId || c.optionId === s.optionId))
        .map((c) => c.studentId),
    );
  };

  return async (label: string, source: ScheduleRowSource | null): Promise<number[]> => {
    if (source?.kind === 'track') return track(source);
    if (source?.kind === 'homeroom') return homeroom(source.gradeLevel, source.classroom);
    if (source?.kind === 'classroom') return savedGroup({ id: source.classroomId });
    // Named nothing — a กลุ่มเรียนพิเศษ of the same name, else "ม.4-1".
    const byName = await savedGroup({ name: label });
    if (byName.length) return byName;
    const m = /^(.+)-([^-]+)$/.exec(label);
    return m ? homeroom(m[1], m[2]) : [];
  };
}
