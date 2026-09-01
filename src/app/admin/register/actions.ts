'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import {
  attendance,
  classroomStudents,
  classrooms,
  people,
  registrations,
  subjectDates,
  subjectSections,
  trackSubjects,
} from '@/db/schema';
import { requireRole } from '@/lib/authz';
import { actorOf } from '@/lib/authz';
import { activeYear } from '@/lib/years';
import { SEMESTERS, trackChoiceRows, tracksForTerm } from '@/lib/tracks';
import { logActivity } from '@/lib/log';
import { normalizeYmd, thaiDateShort } from '@/lib/utils';
import type { ActionResult } from '@/components/action-button';

const SectionInput = z.object({
  /** null creates a new รอบเรียน; an id edits that one */
  sectionId: z.number().int().positive().nullable(),
  subjectId: z.number().int().positive(),
  /** blank is normal — the label is derived from the กลุ่ม or the class days */
  name: z.string().trim().max(120).optional().default(''),
  room: z.string().trim().max(120).optional().default(''),
  dates: z.array(z.string()),
  studentIds: z.array(z.number().int().positive()),
});

/**
 * What to call a รอบเรียน nobody named.
 *
 * Two รอบ of one วิชา are told apart by *who* is in them and *when* they meet —
 * "กลุ่ม A เรียนวันที่ 1, กลุ่ม B เรียนวันที่ 2" — so the label is read off
 * exactly that, in order of how well it identifies the รอบ: the กลุ่มเรียนพิเศษ
 * the roster came from, else the สายการเรียน it came from, else the class days,
 * else a plain number.
 *
 * The order matches the preview the editor shows while typing — if the two ever
 * disagree, the ผู้ดูแล saves one name and gets another.
 */
async function deriveSectionName(
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

export interface SaveSectionResult extends ActionResult {
  sectionId?: number;
  /** the schedule as stored — dates already checked in are kept even if unticked */
  dates?: string[];
}

/**
 * Save a whole รอบเรียน in one go: name, room, class days and the student list.
 *
 * One action rather than three save buttons — a รอบ is only meaningful as the
 * whole set, and saving the days without the students (or the other way round)
 * left the screen in a half-configured state nobody could read back.
 *
 * Everything below happens in a single transaction, so a failure part-way
 * cannot leave a รอบ with new days but an old roster.
 */
export async function saveSection(input: z.infer<typeof SectionInput>): Promise<SaveSectionResult> {
  const user = await requireRole('admin');
  const parsed = SectionInput.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' };
  const year = await activeYear();
  if (!year) return { ok: false, message: 'ยังไม่ได้ซิงก์ปีการศึกษา' };

  const { sectionId, subjectId, name, room, dates, studentIds } = parsed.data;

  const [subject] = await db
    .select({ id: trackSubjects.id, code: trackSubjects.code })
    .from(trackSubjects)
    .where(eq(trackSubjects.id, subjectId))
    .limit(1);
  if (!subject) return { ok: false, message: 'ไม่พบวิชานี้' };

  const cleanDates = [...new Set(dates.map(normalizeYmd).filter(Boolean) as string[])].sort();
  if (cleanDates.length !== dates.length) return { ok: false, message: 'วันที่ไม่ถูกต้อง' };

  const wanted = new Set(studentIds.filter((n) => Number.isInteger(n) && n > 0));
  if (wanted.size) {
    const valid = await db
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.type, 'student'), inArray(people.id, [...wanted])));
    if (valid.length !== wanted.size)
      return { ok: false, message: 'มีนักเรียนบางรายการไม่ถูกต้อง' };
  }

  // Left blank — the normal case — the label comes from the กลุ่ม or the days.
  const label = name || (await deriveSectionName(year.id, subjectId, wanted, cleanDates, sectionId));

  // A name typed by hand still has to be unique, or two รอบ of one วิชา would be
  // indistinguishable in every list.
  if (name) {
    const clash = await db
      .select({ id: subjectSections.id })
      .from(subjectSections)
      .where(
        sectionId
          ? and(
              eq(subjectSections.subjectId, subjectId),
              eq(subjectSections.yearId, year.id),
              eq(subjectSections.name, label),
              ne(subjectSections.id, sectionId),
            )
          : and(
              eq(subjectSections.subjectId, subjectId),
              eq(subjectSections.yearId, year.id),
              eq(subjectSections.name, label),
            ),
      )
      .limit(1);
    if (clash.length)
      return { ok: false, message: `วิชา ${subject.code} มีกลุ่มชื่อ “${label}” อยู่แล้ว` };
  }

  // A student sits in one รอบ of a subject, not two — otherwise their result
  // would be computed twice over two different schedules.
  if (wanted.size) {
    const elsewhere = await db
      .select({ studentId: registrations.studentId, sectionName: subjectSections.name })
      .from(registrations)
      .innerJoin(subjectSections, eq(registrations.sectionId, subjectSections.id))
      .where(
        and(
          eq(registrations.subjectId, subjectId),
          eq(registrations.yearId, year.id),
          isNull(registrations.droppedAt),
          inArray(registrations.studentId, [...wanted]),
          ...(sectionId ? [ne(registrations.sectionId, sectionId)] : []),
        ),
      )
      .limit(5);
    if (elsewhere.length) {
      const names = [...new Set(elsewhere.map((e) => e.sectionName))].join(', ');
      return {
        ok: false,
        message: `มีนักเรียน ${elsewhere.length} คนอยู่ในกลุ่ม “${names}” ของวิชานี้แล้ว — นำออกจากกลุ่มนั้นก่อน`,
      };
    }
  }

  const actor = actorOf(user);
  let id = sectionId;
  let kept: string[] = [];
  let added = 0;
  let dropped = 0;

  await db.transaction(async (tx) => {
    if (id) {
      await tx
        .update(subjectSections)
        .set({ name: label, room: room || null })
        .where(eq(subjectSections.id, id));
    } else {
      const [created] = await tx
        .insert(subjectSections)
        .values({ subjectId, yearId: year.id, name: label, room: room || null })
        .returning({ id: subjectSections.id });
      id = created.id;
    }
    const sid = id;

    // ── schedule ──────────────────────────────────────────────
    const current = await tx
      .select({ date: subjectDates.date })
      .from(subjectDates)
      .where(eq(subjectDates.sectionId, sid));
    const currentDates = new Set(current.map((r) => r.date));
    const toAddDates = cleanDates.filter((d) => !currentDates.has(d));
    const toDropDates = [...currentDates].filter((d) => !cleanDates.includes(d));

    if (toDropDates.length) {
      // A day that has been checked in stays: dropping it would strand its
      // attendance rows outside the schedule and silently move everyone's result.
      const checked = await tx
        .selectDistinct({ date: attendance.date })
        .from(attendance)
        .where(and(eq(attendance.sectionId, sid), inArray(attendance.date, toDropDates)));
      kept = checked.map((r) => r.date);
      const keptSet = new Set(kept);
      const removable = toDropDates.filter((d) => !keptSet.has(d));
      if (removable.length)
        await tx
          .delete(subjectDates)
          .where(and(eq(subjectDates.sectionId, sid), inArray(subjectDates.date, removable)));
    }
    if (toAddDates.length)
      await tx
        .insert(subjectDates)
        .values(toAddDates.map((date) => ({ sectionId: sid, date })))
        .onConflictDoNothing();

    // ── roster ────────────────────────────────────────────────
    // Append-only history (spec §4.3): additions insert a fresh row, removals
    // stamp droppedAt — nothing is deleted, so a transcript can reconstruct any
    // year. Re-adding a previously dropped student creates a new active row.
    const currentRegs = await tx
      .select({ studentId: registrations.studentId })
      .from(registrations)
      .where(and(eq(registrations.sectionId, sid), isNull(registrations.droppedAt)));
    const currentStudents = new Set(currentRegs.map((r) => r.studentId));
    const toAdd = [...wanted].filter((s) => !currentStudents.has(s));
    const toDrop = [...currentStudents].filter((s) => !wanted.has(s));
    added = toAdd.length;
    dropped = toDrop.length;

    if (toDrop.length)
      await tx
        .update(registrations)
        .set({ droppedAt: new Date(), droppedBy: actor })
        .where(
          and(
            eq(registrations.sectionId, sid),
            isNull(registrations.droppedAt),
            inArray(registrations.studentId, toDrop),
          ),
        );
    if (toAdd.length)
      await tx.insert(registrations).values(
        toAdd.map((studentId) => ({
          yearId: year.id,
          subjectId,
          sectionId: sid,
          studentId,
          assignedBy: actor,
        })),
      );
  });

  await logActivity(user, sectionId ? 'update_section' : 'create_section', `section:${id}`, {
    subject: subject.code,
    name,
    dates: cleanDates.length,
    added,
    dropped,
    keptChecked: kept.length,
  });
  revalidatePath('/admin/register');
  revalidatePath('/attendance');

  const effective = [...new Set([...cleanDates, ...kept])].sort();
  const parts = [`วันเรียน ${effective.length} วัน`, `นักเรียน ${wanted.size} คน`];
  if (kept.length) parts.push(`คงวันที่เช็คชื่อแล้วไว้ ${kept.length} วัน`);
  return {
    ok: true,
    message: `${sectionId ? 'บันทึก' : 'สร้าง'}กลุ่ม “${label}” แล้ว — ${parts.join(' · ')}`,
    sectionId: id ?? undefined,
    dates: effective,
  };
}

/**
 * Delete a รอบเรียน outright — schedule, roster and the section itself.
 *
 * Refused once attendance exists: those records are the evidence a result is
 * computed from, so a รอบ that has already been checked in has to be unpicked
 * in attendance first.
 */
export async function deleteSection(sectionId: number): Promise<ActionResult> {
  const user = await requireRole('admin');
  const year = await activeYear();
  if (!year) return { ok: false, message: 'ยังไม่ได้ซิงก์ปีการศึกษา' };

  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(attendance)
    .where(eq(attendance.sectionId, sectionId));
  if (Number(n) > 0)
    return {
      ok: false,
      message: `ลบไม่ได้: กลุ่มนี้เช็คชื่อไปแล้ว ${n} รายการ — ต้องลบข้อมูลเช็คชื่อก่อน`,
    };

  await db.transaction(async (tx) => {
    // Registrations are restrict-referenced, so they go before the section.
    await tx.delete(registrations).where(eq(registrations.sectionId, sectionId));
    await tx.delete(subjectSections).where(eq(subjectSections.id, sectionId));
  });

  await logActivity(user, 'delete_section', `section:${sectionId}`);
  revalidatePath('/admin/register');
  revalidatePath('/attendance');
  return { ok: true, message: 'ลบกลุ่มเรียนแล้ว' };
}

const GroupInput = z.object({
  name: z.string().trim().min(1, 'กรอกชื่อกลุ่ม').max(120),
  studentIds: z.array(z.number().int().positive()).min(1, 'เลือกนักเรียนอย่างน้อย 1 คน'),
});

/**
 * Save the students currently ticked as a reusable กลุ่มเรียนพิเศษ, so the same
 * set can be dropped into the next รอบเรียน without re-ticking it. Same rows the
 * ห้องเรียนพิเศษ page manages — this is just the shortcut from here.
 */
export async function createGroupFromSelection(form: {
  name: string;
  studentIds: number[];
}): Promise<ActionResult & { groupId?: number }> {
  const user = await requireRole('admin');
  const year = await activeYear();
  if (!year) return { ok: false, message: 'ยังไม่ได้ซิงก์ปีการศึกษา' };
  const parsed = GroupInput.safeParse(form);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' };
  const { name, studentIds } = parsed.data;

  const ids = [...new Set(studentIds)];
  const valid = await db
    .select({ id: people.id })
    .from(people)
    .where(and(eq(people.type, 'student'), inArray(people.id, ids)));
  if (valid.length !== ids.length) return { ok: false, message: 'มีนักเรียนบางรายการไม่ถูกต้อง' };

  const clash = await db
    .select({ id: classrooms.id })
    .from(classrooms)
    .where(and(eq(classrooms.yearId, year.id), eq(classrooms.name, name)))
    .limit(1);
  if (clash.length) return { ok: false, message: `มีกลุ่ม “${name}” อยู่แล้วในปีนี้` };

  const [created] = await db
    .insert(classrooms)
    .values({ yearId: year.id, name })
    .returning({ id: classrooms.id });
  await db
    .insert(classroomStudents)
    .values(ids.map((studentId) => ({ classroomId: created.id, studentId })));

  await logActivity(user, 'create_classroom', name, { from: 'register', count: ids.length });
  revalidatePath('/admin/register');
  revalidatePath('/admin/classrooms');
  return { ok: true, message: `สร้างกลุ่ม “${name}” (${ids.length} คน) แล้ว`, groupId: created.id };
}
