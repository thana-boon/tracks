import 'server-only';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/db';
import { classroomStudents, classrooms, subjectSections } from '@/db/schema';
import { SEMESTERS, trackChoiceRows, tracksForTerm } from '@/lib/tracks';
import { thaiDateShort } from '@/lib/utils';

/**
 * What to call a รอบเรียน nobody named.
 *
 * Two รอบ of one วิชา are told apart by *who* is in them and *when* they meet —
 * "กลุ่ม A เรียนวันที่ 1, กลุ่ม B เรียนวันที่ 2" — so the label is read off
 * exactly that, in order of how well it identifies the รอบ: the กลุ่มเรียนพิเศษ
 * the roster came from, else the สายการเรียน it came from, else the class days,
 * else a plain number.
 *
 * The order matches the preview the จัดนักเรียนเข้าวิชา editor shows while
 * typing — if the two ever disagree, the ผู้ดูแล saves one name and gets
 * another. It lives here rather than beside that editor because ตารางเรียนทั้งปี
 * opens รอบ of its own and has to name them the same way.
 */
export async function deriveSectionName(
  yearId: number,
  subjectId: number,
  studentIds: Set<number>,
  dates: string[],
  exceptSectionId: number | null,
): Promise<string> {
  let base = '';

  // A roster that exactly matches a saved กลุ่ม is named after it.
  if (studentIds.size) {
    const rows = await db
      .select({
        id: classrooms.id,
        name: classrooms.name,
        studentId: classroomStudents.studentId,
      })
      .from(classrooms)
      .innerJoin(classroomStudents, eq(classroomStudents.classroomId, classrooms.id))
      .where(eq(classrooms.yearId, yearId));
    const members = new Map<number, { name: string; ids: Set<number> }>();
    for (const r of rows) {
      const entry = members.get(r.id) ?? { name: r.name, ids: new Set<number>() };
      entry.ids.add(r.studentId);
      members.set(r.id, entry);
    }
    for (const { name, ids } of members.values()) {
      if (ids.size === studentIds.size && [...ids].every((id) => studentIds.has(id))) {
        base = name;
        break;
      }
    }
  }

  // …else the สาย, when the roster is exactly one Track (or one of its ข้อย่อย)
  // of this ปีการศึกษา — the chip on the editor is the usual way such a roster
  // gets built, and "TrackSM · กฎหมาย" identifies the รอบ far better than the
  // date it happens to meet on.
  if (!base && studentIds.size) {
    for (const semester of SEMESTERS) {
      const [defined, chosen] = await Promise.all([
        tracksForTerm(yearId, semester),
        trackChoiceRows(yearId, semester),
      ]);
      for (const t of defined) {
        const mine = chosen.filter((c) => c.trackId === t.id);
        if (!mine.length) continue;
        const candidates: { label: string; ids: number[] }[] = [
          { label: t.name, ids: mine.map((c) => c.studentId) },
          ...t.options.map((o) => ({
            label: `${t.name} · ${o.name}`,
            ids: mine.filter((c) => c.optionId === o.id).map((c) => c.studentId),
          })),
        ];
        for (const c of candidates) {
          if (
            c.ids.length === studentIds.size &&
            c.ids.length > 0 &&
            c.ids.every((id) => studentIds.has(id))
          ) {
            base = c.label;
            break;
          }
        }
        if (base) break;
      }
      if (base) break;
    }
  }

  if (!base && dates.length)
    base = dates.length === 1 ? thaiDateShort(dates[0]) : `${thaiDateShort(dates[0])} +${dates.length - 1}`;

  const taken = new Set(
    (
      await db
        .select({ name: subjectSections.name })
        .from(subjectSections)
        .where(
          exceptSectionId
            ? and(
                eq(subjectSections.subjectId, subjectId),
                eq(subjectSections.yearId, yearId),
                ne(subjectSections.id, exceptSectionId),
              )
            : and(eq(subjectSections.subjectId, subjectId), eq(subjectSections.yearId, yearId)),
        )
    ).map((r) => r.name),
  );

  if (!base) {
    for (let i = 1; i <= 99; i++) {
      if (!taken.has(`กลุ่มที่ ${i}`)) return `กลุ่มที่ ${i}`;
    }
    return `กลุ่ม ${Date.now()}`;
  }
  if (!taken.has(base)) return base;
  for (let i = 2; i <= 99; i++) {
    if (!taken.has(`${base} (${i})`)) return `${base} (${i})`;
  }
  return `${base} (${Date.now()})`;
}
