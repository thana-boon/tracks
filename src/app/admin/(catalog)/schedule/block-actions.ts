'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, max, ne } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import {
  scheduleBlockDays,
  scheduleBlockRows,
  scheduleBlocks,
  subjectDates,
  subjectSections,
  trackSubjects,
} from '@/db/schema';
import { requireCatalogEditor } from '@/lib/authz';
import { activeYear } from '@/lib/years';
import { dayIsChecked } from '@/lib/schedule';
import { logActivity } from '@/lib/log';
import { syncRowRosters } from '@/lib/row-roster';
import { normalizeYmd, thaiDateLong } from '@/lib/utils';
import type { ActionResult } from '@/components/action-button';
import { addClassDays } from './actions';

/**
 * ตารางรอบ — the layout (รอบ, its ห้อง, its วัน) lives in schedule_block*; the
 * cells are subject_dates of the รอบเรียน named after each ห้อง. Every write
 * here that touches a cell goes through the same rules as the list view: a
 * day already checked in is never moved or taken away.
 */
function revalidateSchedule() {
  revalidatePath('/admin/schedule');
  revalidatePath('/admin/register');
  revalidatePath('/attendance');
}

/** The รอบ, only if it belongs to the ปีการศึกษา in use. */
async function blockInActiveYear(blockId: number) {
  const year = await activeYear();
  if (!year) return null;
  const [block] = await db
    .select()
    .from(scheduleBlocks)
    .where(and(eq(scheduleBlocks.id, blockId), eq(scheduleBlocks.yearId, year.id)))
    .limit(1);
  return block ? { block, year } : null;
}

/**
 * The class days behind a set of cells: every (รอบเรียน, วัน) of the year whose
 * รอบเรียน is named one of `labels` and whose day is one of `dates`.
 */
async function cellsOf(yearId: number, labels: string[], dates: string[]) {
  if (!labels.length || !dates.length) return [];
  return db
    .select({
      sectionId: subjectSections.id,
      label: subjectSections.name,
      subjectId: subjectSections.subjectId,
      subjectCode: trackSubjects.code,
      date: subjectDates.date,
    })
    .from(subjectDates)
    .innerJoin(subjectSections, eq(subjectDates.sectionId, subjectSections.id))
    .innerJoin(trackSubjects, eq(subjectSections.subjectId, trackSubjects.id))
    .where(
      and(
        eq(subjectSections.yearId, yearId),
        inArray(subjectSections.name, labels),
        inArray(subjectDates.date, dates),
      ),
    );
}

// ── รอบ ──────────────────────────────────────────────────────

const BlockInput = z.object({
  semester: z.number().int().min(1).max(2),
  name: z.string().trim().min(1, 'ตั้งชื่อรอบ').max(80),
});

export async function createBlock(input: z.infer<typeof BlockInput>): Promise<ActionResult> {
  const user = await requireCatalogEditor();
  const parsed = BlockInput.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง',
    };
  const year = await activeYear();
  if (!year) return { ok: false, message: 'ยังไม่ได้ซิงก์ปีการศึกษา' };
  const { semester, name } = parsed.data;

  const [clash] = await db
    .select({ id: scheduleBlocks.id })
    .from(scheduleBlocks)
    .where(
      and(
        eq(scheduleBlocks.yearId, year.id),
        eq(scheduleBlocks.semester, semester),
        eq(scheduleBlocks.name, name),
      ),
    )
    .limit(1);
  if (clash)
    return {
      ok: false,
      message: `ภาคเรียนที่ ${semester} มีรอบ “${name}” อยู่แล้ว`,
    };

  const [{ last }] = await db
    .select({ last: max(scheduleBlocks.sortOrder) })
    .from(scheduleBlocks)
    .where(and(eq(scheduleBlocks.yearId, year.id), eq(scheduleBlocks.semester, semester)));
  await db
    .insert(scheduleBlocks)
    .values({ yearId: year.id, semester, name, sortOrder: (last ?? 0) + 1 });
  await logActivity(user, 'create_schedule_block', `semester:${semester}`, {
    name,
  });
  revalidatePath('/admin/schedule');
  return { ok: true, message: `เพิ่มรอบ “${name}” แล้ว` };
}

export async function renameBlock(blockId: number, name: string): Promise<ActionResult> {
  const user = await requireCatalogEditor();
  const clean = String(name ?? '')
    .trim()
    .slice(0, 80);
  if (!clean) return { ok: false, message: 'ตั้งชื่อรอบ' };
  const found = await blockInActiveYear(blockId);
  if (!found) return { ok: false, message: 'ไม่พบรอบนี้' };
  const { block } = found;
  const [clash] = await db
    .select({ id: scheduleBlocks.id })
    .from(scheduleBlocks)
    .where(
      and(
        eq(scheduleBlocks.yearId, block.yearId),
        eq(scheduleBlocks.semester, block.semester),
        eq(scheduleBlocks.name, clean),
        ne(scheduleBlocks.id, block.id),
      ),
    )
    .limit(1);
  if (clash) return { ok: false, message: `มีรอบ “${clean}” อยู่แล้ว` };
  await db.update(scheduleBlocks).set({ name: clean }).where(eq(scheduleBlocks.id, block.id));
  await logActivity(user, 'rename_schedule_block', `block:${block.id}`, {
    from: block.name,
    to: clean,
  });
  revalidatePath('/admin/schedule');
  return { ok: true, message: `เปลี่ยนชื่อเป็น “${clean}” แล้ว` };
}

/**
 * Delete the layout of a รอบ. The วันเรียน its cells made stay where they are
 * — they belong to รอบเรียน that เช็คชื่อ and จัดนักเรียนเข้าวิชา already use,
 * and still show on the รายการทั้งหมด view.
 */
export async function deleteBlock(blockId: number): Promise<ActionResult> {
  const user = await requireCatalogEditor();
  const found = await blockInActiveYear(blockId);
  if (!found) return { ok: false, message: 'ไม่พบรอบนี้' };
  await db.delete(scheduleBlocks).where(eq(scheduleBlocks.id, blockId));
  await logActivity(user, 'delete_schedule_block', `block:${blockId}`, {
    name: found.block.name,
  });
  revalidatePath('/admin/schedule');
  return {
    ok: true,
    message: `ลบรอบ “${found.block.name}” แล้ว — วันเรียนที่จัดไว้ยังอยู่ในรายการทั้งหมด`,
  };
}

// ── ห้อง ─────────────────────────────────────────────────────

const SourceInput = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('homeroom'),
      gradeLevel: z.string().trim().min(1).max(20),
      classroom: z.string().trim().min(1).max(20),
    }),
    z.object({
      kind: z.literal('track'),
      semester: z.number().int().min(1).max(2),
      trackId: z.number().int().positive(),
      optionId: z.number().int().positive().nullable(),
    }),
    z.object({
      kind: z.literal('classroom'),
      classroomId: z.number().int().positive(),
    }),
  ])
  .nullable();

const RowsInput = z.object({
  blockId: z.number().int().positive(),
  rows: z
    .array(
      z.object({
        id: z.number().int().positive().nullable(),
        label: z.string().trim().min(1, 'ใส่ชื่อห้องให้ครบทุกแถว').max(120),
        source: SourceInput,
      }),
    )
    .max(80),
});

/**
 * Replace the ห้อง of a รอบ with the list as edited — order included.
 *
 * Renaming or removing a ห้อง that already has วิชา in its cells is refused:
 * the cells are รอบเรียน named after the ห้อง, so the old name would leave
 * them out of the table with nobody seeing them go.
 */
export async function saveBlockRows(input: z.infer<typeof RowsInput>): Promise<ActionResult> {
  const user = await requireCatalogEditor();
  const parsed = RowsInput.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง',
    };
  const found = await blockInActiveYear(parsed.data.blockId);
  if (!found) return { ok: false, message: 'ไม่พบรอบนี้' };
  const { block, year } = found;
  const rows = parsed.data.rows;

  const labels = rows.map((r) => r.label);
  const dup = labels.find((l, i) => labels.indexOf(l) !== i);
  if (dup) return { ok: false, message: `ห้อง “${dup}” ซ้ำกัน` };

  const [before, days] = await Promise.all([
    db.select().from(scheduleBlockRows).where(eq(scheduleBlockRows.blockId, block.id)),
    db
      .select({ date: scheduleBlockDays.date })
      .from(scheduleBlockDays)
      .where(eq(scheduleBlockDays.blockId, block.id)),
  ]);
  const gone = before.filter((b) => !rows.some((r) => r.id === b.id && r.label === b.label));
  const used = await cellsOf(
    year.id,
    gone.map((g) => g.label),
    days.map((d) => d.date),
  );
  if (used.length) {
    const names = [...new Set(used.map((u) => u.label))].join(', ');
    return {
      ok: false,
      message: `ห้อง ${names} มีวิชาจัดไว้แล้ว — ล้างช่องของห้องนั้นก่อน จึงจะเปลี่ยนชื่อหรือลบได้`,
    };
  }

  await db.transaction(async (tx) => {
    await tx.delete(scheduleBlockRows).where(eq(scheduleBlockRows.blockId, block.id));
    if (rows.length)
      await tx.insert(scheduleBlockRows).values(
        rows.map((r, i) => ({
          blockId: block.id,
          label: r.label,
          source: r.source,
          sortOrder: i + 1,
        })),
      );
  });
  // A ห้อง that has just named its นักเรียน brings them into the กลุ่ม its
  // cells already hold, not only into กลุ่ม opened from now on.
  const placed = await syncRowRosters(year.id);
  await logActivity(user, 'save_schedule_rows', `block:${block.id}`, {
    rows: labels,
    ...(placed ? { rosterPlaced: placed } : {}),
  });
  if (placed) revalidateSchedule();
  revalidatePath('/admin/schedule');
  return {
    ok: true,
    message: `บันทึกห้องของ “${block.name}” แล้ว (${rows.length} ห้อง)`,
  };
}

// ── วัน ──────────────────────────────────────────────────────

const DaysInput = z.object({
  blockId: z.number().int().positive(),
  days: z
    .array(
      z.object({
        date: z.string(),
        note: z.string().trim().max(160).optional().default(''),
      }),
    )
    .max(60),
});

/**
 * Replace the วัน of a รอบ. A วัน belongs to one รอบ of the year — two รอบ
 * sharing a day would show the same cells twice — and a วัน whose cells
 * already hold วิชา cannot simply be dropped (ย้ายวัน moves it instead).
 */
export async function saveBlockDays(input: z.infer<typeof DaysInput>): Promise<ActionResult> {
  const user = await requireCatalogEditor();
  const parsed = DaysInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'ข้อมูลไม่ถูกต้อง' };
  const found = await blockInActiveYear(parsed.data.blockId);
  if (!found) return { ok: false, message: 'ไม่พบรอบนี้' };
  const { block, year } = found;

  const days = parsed.data.days.map((d) => ({
    date: normalizeYmd(d.date),
    note: d.note,
  }));
  if (days.some((d) => !d.date)) return { ok: false, message: 'วันที่ไม่ถูกต้อง' };
  const dates = [...new Set(days.map((d) => d.date as string))];

  const others = dates.length
    ? await db
        .select({ date: scheduleBlockDays.date, name: scheduleBlocks.name })
        .from(scheduleBlockDays)
        .innerJoin(scheduleBlocks, eq(scheduleBlockDays.blockId, scheduleBlocks.id))
        .where(
          and(
            eq(scheduleBlocks.yearId, year.id),
            ne(scheduleBlocks.id, block.id),
            inArray(scheduleBlockDays.date, dates),
          ),
        )
        .limit(1)
    : [];
  if (others.length)
    return {
      ok: false,
      message: `${thaiDateLong(others[0].date)} อยู่ในรอบ “${others[0].name}” แล้ว`,
    };

  const [before, rows] = await Promise.all([
    db
      .select({ date: scheduleBlockDays.date })
      .from(scheduleBlockDays)
      .where(eq(scheduleBlockDays.blockId, block.id)),
    db
      .select({ label: scheduleBlockRows.label })
      .from(scheduleBlockRows)
      .where(eq(scheduleBlockRows.blockId, block.id)),
  ]);
  const dropped = before.map((b) => b.date).filter((d) => !dates.includes(d));
  const used = await cellsOf(
    year.id,
    rows.map((r) => r.label),
    dropped,
  );
  if (used.length) {
    const list = [...new Set(used.map((u) => u.date))].sort().map(thaiDateLong).join(', ');
    return {
      ok: false,
      message: `${list} มีวิชาจัดไว้แล้ว — ล้างช่องของวันนั้นก่อน หรือใช้ “ย้ายวัน”`,
    };
  }

  const seen = new Set<string>();
  const values = days
    .filter((d) => (seen.has(d.date!) ? false : (seen.add(d.date!), true)))
    .map((d) => ({ blockId: block.id, date: d.date!, note: d.note || null }));
  await db.transaction(async (tx) => {
    await tx.delete(scheduleBlockDays).where(eq(scheduleBlockDays.blockId, block.id));
    if (values.length) await tx.insert(scheduleBlockDays).values(values);
  });
  await logActivity(user, 'save_schedule_days', `block:${block.id}`, {
    days: dates.sort(),
  });
  revalidatePath('/admin/schedule');
  return {
    ok: true,
    message: `บันทึกวันของ “${block.name}” แล้ว (${values.length} วัน)`,
  };
}

const MoveDayInput = z.object({
  blockId: z.number().int().positive(),
  from: z.string(),
  to: z.string(),
});

/**
 * Move one วัน of a รอบ — and every วิชา in its cells — to another date: a
 * holiday lands on the day and the whole row of the timetable slides a week.
 * All or nothing: one checked-in cell, or a ห้อง that already meets on the
 * new date, refuses the whole move.
 */
export async function moveBlockDay(input: z.infer<typeof MoveDayInput>): Promise<ActionResult> {
  const user = await requireCatalogEditor();
  const parsed = MoveDayInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'ข้อมูลไม่ถูกต้อง' };
  const from = normalizeYmd(parsed.data.from);
  const to = normalizeYmd(parsed.data.to);
  if (!from || !to) return { ok: false, message: 'วันที่ไม่ถูกต้อง' };
  if (from === to) return { ok: true, message: 'วันเดิม — ไม่มีอะไรเปลี่ยน' };
  const found = await blockInActiveYear(parsed.data.blockId);
  if (!found) return { ok: false, message: 'ไม่พบรอบนี้' };
  const { block, year } = found;

  const [taken] = await db
    .select({ name: scheduleBlocks.name })
    .from(scheduleBlockDays)
    .innerJoin(scheduleBlocks, eq(scheduleBlockDays.blockId, scheduleBlocks.id))
    .where(and(eq(scheduleBlocks.yearId, year.id), eq(scheduleBlockDays.date, to)))
    .limit(1);
  if (taken)
    return {
      ok: false,
      message: `${thaiDateLong(to)} อยู่ในรอบ “${taken.name}” แล้ว`,
    };

  const rows = await db
    .select({ label: scheduleBlockRows.label })
    .from(scheduleBlockRows)
    .where(eq(scheduleBlockRows.blockId, block.id));
  const cells = await cellsOf(
    year.id,
    rows.map((r) => r.label),
    [from],
  );
  for (const c of cells) {
    if (await dayIsChecked(c.sectionId, from))
      return {
        ok: false,
        message: `ย้ายไม่ได้: ${c.label} · ${c.subjectCode} เช็คชื่อวันนี้ไปแล้ว`,
      };
  }
  const sectionIds = cells.map((c) => c.sectionId);
  if (sectionIds.length) {
    const clash = await db
      .select({ id: subjectDates.id })
      .from(subjectDates)
      .where(and(inArray(subjectDates.sectionId, sectionIds), eq(subjectDates.date, to)))
      .limit(1);
    if (clash.length)
      return {
        ok: false,
        message: `บางกลุ่มมีวันเรียน ${thaiDateLong(to)} อยู่แล้ว`,
      };
  }

  await db.transaction(async (tx) => {
    if (sectionIds.length)
      await tx
        .update(subjectDates)
        .set({ date: to })
        .where(and(inArray(subjectDates.sectionId, sectionIds), eq(subjectDates.date, from)));
    await tx
      .update(scheduleBlockDays)
      .set({ date: to })
      .where(and(eq(scheduleBlockDays.blockId, block.id), eq(scheduleBlockDays.date, from)));
  });
  await logActivity(user, 'move_schedule_day', `block:${block.id}`, {
    from,
    to,
    cells: sectionIds.length,
  });
  revalidateSchedule();
  return {
    ok: true,
    message: `ย้าย ${thaiDateLong(from)} เป็น ${thaiDateLong(to)} แล้ว (${sectionIds.length} ช่อง)`,
  };
}

// ── ช่อง ─────────────────────────────────────────────────────

const CellInput = z.object({
  blockId: z.number().int().positive(),
  rowId: z.number().int().positive(),
  /** one or more วัน of the รอบ — a วิชา that meets on several days takes them all at once */
  dates: z.array(z.string()).min(1, 'เลือกวันอย่างน้อย 1 วัน').max(60),
  /** null clears the cells */
  subjectId: z.number().int().positive().nullable(),
});

/**
 * Put a วิชา in the cells of one ห้อง on one or more วัน — or clear them.
 *
 * Each cell is the รอบเรียน of that วิชา named after the ห้อง: found if it
 * exists, opened if not (with the ห้อง's นักเรียน, when the ห้อง names where
 * they come from and the user is a ผู้ดูแล). Whatever วิชา a cell held before
 * loses that day — unless it has been checked in, which refuses the whole
 * press: half the days changed would be harder to read back than none.
 */
export async function setCell(input: z.infer<typeof CellInput>): Promise<ActionResult> {
  const user = await requireCatalogEditor();
  const parsed = CellInput.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' };
  const normalized = parsed.data.dates.map(normalizeYmd);
  if (normalized.some((d) => !d)) return { ok: false, message: 'วันที่ไม่ถูกต้อง' };
  const dates = [...new Set(normalized as string[])].sort();
  const { rowId, subjectId } = parsed.data;
  const found = await blockInActiveYear(parsed.data.blockId);
  if (!found) return { ok: false, message: 'ไม่พบรอบนี้' };
  const { block, year } = found;

  const [[row], days] = await Promise.all([
    db
      .select()
      .from(scheduleBlockRows)
      .where(and(eq(scheduleBlockRows.id, rowId), eq(scheduleBlockRows.blockId, block.id)))
      .limit(1),
    db
      .select({ date: scheduleBlockDays.date })
      .from(scheduleBlockDays)
      .where(and(eq(scheduleBlockDays.blockId, block.id), inArray(scheduleBlockDays.date, dates))),
  ]);
  if (!row) return { ok: false, message: 'ไม่พบห้องนี้ในรอบ' };
  if (days.length !== dates.length) return { ok: false, message: 'มีวันที่ไม่อยู่ในรอบนี้' };

  const current = await cellsOf(year.id, [row.label], dates);
  const others = current.filter((c) => c.subjectId !== subjectId);
  for (const c of others) {
    if (await dayIsChecked(c.sectionId, c.date))
      return {
        ok: false,
        message: `เปลี่ยนไม่ได้: ${row.label} · ${c.subjectCode} เช็คชื่อ ${thaiDateLong(c.date)} ไปแล้ว`,
      };
  }
  const missing = subjectId
    ? dates.filter((d) => !current.some((c) => c.date === d && c.subjectId === subjectId))
    : [];
  if (!others.length && !missing.length)
    return {
      ok: true,
      message: subjectId ? 'วิชาเดิม — ไม่มีอะไรเปลี่ยน' : 'ช่องว่างอยู่แล้ว',
    };

  let message = '';
  if (subjectId && missing.length) {
    const [section] = await db
      .select({ id: subjectSections.id })
      .from(subjectSections)
      .where(
        and(
          eq(subjectSections.subjectId, subjectId),
          eq(subjectSections.yearId, year.id),
          eq(subjectSections.name, row.label),
        ),
      )
      .limit(1);
    const r = await addClassDays({
      subjectId,
      sectionId: section?.id ?? null,
      newSectionName: row.label,
      room: '',
      dates: missing,
      // Only a ผู้ดูแล places นักเรียน; a moderator's cell opens the รอบ empty.
      source: !section && user.role === 'admin' ? (row.source ?? null) : null,
    });
    if (!r.ok) return r;
    message = r.message;
  }

  for (const c of others)
    await db
      .delete(subjectDates)
      .where(and(eq(subjectDates.sectionId, c.sectionId), eq(subjectDates.date, c.date)));

  // Whoever pressed the cell, the ห้อง's นักเรียน are registered in the กลุ่ม
  // — also when the กลุ่ม already existed.
  await syncRowRosters(year.id);

  await logActivity(user, 'set_schedule_cell', `block:${block.id}`, {
    row: row.label,
    dates,
    subjectId,
    removed: others.map((c) => `${c.subjectCode}@${c.date}`),
  });
  revalidateSchedule();
  const when = dates.length === 1 ? thaiDateLong(dates[0]) : `${dates.length} วัน`;
  if (!subjectId)
    return {
      ok: true,
      message: `ล้างช่อง ${row.label} · ${when} แล้ว`,
    };
  return {
    ok: true,
    message: message || `${row.label} · ${when} บันทึกแล้ว`,
  };
}
