'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  BookPlus,
  CalendarDays,
  CalendarRange,
  Loader2,
  MoveRight,
  Pencil,
  Plus,
  Rows3,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardHeader, EmptyState, Input, Label, Select } from '@/components/ui';
import { Modal, useDialog } from '@/components/dialog';
import { ThaiCalendar } from '@/components/thai-calendar';
import {
  cn,
  gradeInLabel,
  thaiDateLong,
  thaiDateShort,
  todayYmd,
  weekdayOfYmd,
  THAI_WEEKDAYS_SHORT,
} from '@/lib/utils';
import { GROUP_COLORS } from '@/lib/group-color';
import type { ScheduleRowSource } from '@/db/schema';
import type { BlockRow, ScheduleBlock, ScheduleRow } from '@/lib/schedule';
import {
  createBlock,
  deleteBlock,
  moveBlockDay,
  renameBlock,
  saveBlockDays,
  saveBlockRows,
  setCell,
} from './block-actions';
import { saveSubject } from '../subjects/actions';
import type {
  ScheduleGroup,
  ScheduleHomeroom,
  ScheduleSavedGroup,
  ScheduleSubject,
  ScheduleTrackGroup,
} from './schedule-manager';

/** Where a ห้อง's นักเรียน come from, as one <select> value. */
function sourceKey(s: ScheduleRowSource | null): string {
  if (!s) return 'none';
  if (s.kind === 'homeroom') return `home:${s.gradeLevel}/${s.classroom}`;
  if (s.kind === 'track')
    return `track:${s.semester}:${s.trackId}${s.optionId ? `:${s.optionId}` : ''}`;
  return `room:${s.classroomId}`;
}

/**
 * สีของช่อง — one colour per วิชา within a รอบ, handed out in the order the
 * วิชา first appear, so the วิชา a ห้อง rotates through each read as their own
 * colour down the sheet (the way the school's printed timetable does) rather
 * than one tint per กลุ่มวิชา that leaves a whole รอบ the same shade. Mixed
 * against --card / --foreground so it holds in both themes.
 */
const hexOf = (key: string) => GROUP_COLORS.find((c) => c.key === key)!.hex;
const CELL_HEXES = [
  'sky',
  'orange',
  'green',
  'pink',
  'purple',
  'amber',
  'teal',
  'red',
  'blue',
  'lime',
  'brown',
].map(hexOf);

const mixCard = (hex: string, pct: number) => `color-mix(in srgb, ${hex} ${pct}%, var(--card))`;
const mixInk = (hex: string) => `color-mix(in srgb, ${hex} 70%, var(--foreground))`;

/** ม.4 / ม.5 / ม.6 each get a colour of their own on the ห้อง column. */
const GRADE_HEX: Record<string, string> = {
  'ม.4': hexOf('blue'),
  'ม.5': hexOf('teal'),
  'ม.6': hexOf('purple'),
};

/** The label a ห้องประจำชั้น gets as a ห้อง of the timetable: ม.4/1 → "ม.4-1". */
const homeroomLabel = (h: { gradeLevel: string; classroom: string }) =>
  `${h.gradeLevel}-${h.classroom}`;

interface Shared {
  rows: ScheduleRow[];
  checked: Set<string>;
  groups: ScheduleGroup[];
  subjects: ScheduleSubject[];
  homerooms: ScheduleHomeroom[];
  trackGroups: ScheduleTrackGroup[];
  savedGroups: ScheduleSavedGroup[];
  /** ผู้ดูแล only — whether a ห้อง may name where its นักเรียน come from */
  canPlace: boolean;
}

/**
 * ตารางรอบ of one ภาคเรียน — every รอบ the ผู้ดูแล has drawn, each printed the
 * way the school's own sheet is: วันที่ down the side, the ห้อง of that วัน
 * under it, and the วิชา · ผู้สอน · สถาบัน the ห้อง goes to that day.
 */
export function TermBoard({
  semester,
  blocks,
  ...shared
}: Shared & { semester: number; blocks: ScheduleBlock[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const mine = blocks.filter((b) => b.semester === semester);

  async function add() {
    if (adding) return;
    setAdding(true);
    const r = await createBlock({
      semester,
      name: name.trim() || `รอบที่ ${mine.length + 1}`,
    });
    setAdding(false);
    if (r.ok) {
      toast.success(r.message);
      setName('');
      router.refresh();
    } else toast.error(r.message);
  }

  return (
    <div className="space-y-6">
      {mine.length === 0 ? (
        <EmptyState
          icon={<CalendarRange className="size-8" strokeWidth={1.5} />}
          title={`ภาคเรียนที่ ${semester} ยังไม่มีตารางรอบ`}
          hint="เพิ่มรอบด้านล่าง แล้วกำหนดห้องและวันของรอบนั้น จากนั้นกดช่องในตารางเพื่อเลือกวิชา"
        />
      ) : (
        mine.map((b) => <BlockCard key={b.id} block={b} {...shared} />)
      )}

      <Card>
        <div className="flex flex-wrap items-end gap-3 p-4 sm:p-5">
          <div className="min-w-48 flex-1">
            <Label htmlFor={`new-block-${semester}`}>เพิ่มรอบในภาคเรียนที่ {semester}</Label>
            <Input
              id={`new-block-${semester}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && add()}
              placeholder={`เช่น รอบที่ ${mine.length + 1} — เว้นว่างได้`}
            />
          </div>
          <Button onClick={add} disabled={adding}>
            {adding ? (
              <Loader2 className="size-4.5 animate-spin" />
            ) : (
              <Plus className="size-4.5" strokeWidth={1.9} />
            )}
            เพิ่มรอบ
          </Button>
        </div>
      </Card>
    </div>
  );
}

function BlockCard({ block, ...shared }: Shared & { block: ScheduleBlock }) {
  const router = useRouter();
  const dialog = useDialog();
  const [editing, setEditing] = useState<'rows' | 'days' | null>(null);
  const [cell, setCellOpen] = useState<{ row: BlockRow; date: string } | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const today = todayYmd();

  // (วัน, ห้อง) → the วิชา meeting there. More than one is a clash the
  // ผู้ดูแล has to see, so the list is kept rather than the first taken.
  const cells = useMemo(() => {
    const labels = new Set(block.rows.map((r) => r.label));
    const dates = new Set(block.days.map((d) => d.date));
    const by = new Map<string, ScheduleRow[]>();
    for (const r of shared.rows) {
      if (!labels.has(r.sectionName) || !dates.has(r.date)) continue;
      const k = `${r.date}|${r.sectionName}`;
      by.set(k, [...(by.get(k) ?? []), r]);
    }
    return by;
  }, [block, shared.rows]);
  const colorOf = useMemo(() => {
    const order: number[] = [];
    for (const d of block.days)
      for (const r of block.rows)
        for (const c of cells.get(`${d.date}|${r.label}`) ?? [])
          if (!order.includes(c.subjectId)) order.push(c.subjectId);
    return new Map(order.map((id, i) => [id, CELL_HEXES[i % CELL_HEXES.length]]));
  }, [block, cells]);
  const filled = [...cells.values()].length;
  const total = block.rows.length * block.days.length;

  async function rename() {
    const value = renaming?.trim();
    setRenaming(null);
    if (!value || value === block.name) return;
    const r = await renameBlock(block.id, value);
    if (r.ok) {
      toast.success(r.message);
      router.refresh();
    } else toast.error(r.message);
  }

  async function remove() {
    const ok = await dialog.confirm({
      title: `ลบรอบ “${block.name}”?`,
      description:
        'ลบเฉพาะโครงตาราง (ห้องและวัน) — วันเรียนที่จัดลงช่องไว้แล้วยังอยู่ และยังเห็นได้ในแท็บรายการทั้งหมด',
      tone: 'destructive',
      confirmLabel: 'ลบรอบ',
    });
    if (!ok) return;
    const r = await deleteBlock(block.id);
    if (r.ok) {
      toast.success(r.message);
      router.refresh();
    } else toast.error(r.message);
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader
        className="bg-primary/[0.06]"
        icon={<CalendarRange className="size-4.5" strokeWidth={1.8} />}
        title={
          renaming !== null ? (
            <Input
              value={renaming}
              onChange={(e) => setRenaming(e.target.value)}
              onBlur={rename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') rename();
                if (e.key === 'Escape') setRenaming(null);
              }}
              className="h-9 w-56"
              aria-label="ชื่อรอบ"
              autoFocus
            />
          ) : (
            <button
              type="button"
              onClick={() => setRenaming(block.name)}
              className="inline-flex items-center gap-1.5 hover:text-primary"
              title="เปลี่ยนชื่อรอบ"
            >
              {block.name}
              <Pencil className="size-3.5 text-muted-foreground" strokeWidth={1.8} />
            </button>
          )
        }
        action={
          <>
            <Badge tone="secondary">
              {block.days.length} วัน · {block.rows.length} ห้อง · จัดแล้ว {filled}/{total}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => setEditing('rows')}>
              <Rows3 className="size-4" strokeWidth={1.9} />
              ห้อง
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditing('days')}>
              <CalendarDays className="size-4" strokeWidth={1.9} />
              วัน
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={remove}
              title="ลบรอบนี้"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" strokeWidth={1.9} />
            </Button>
          </>
        }
      />

      {block.rows.length === 0 || block.days.length === 0 ? (
        <div className="px-4 pb-5 sm:px-5">
          <EmptyState
            title={block.rows.length === 0 ? 'ยังไม่ได้กำหนดห้อง' : 'ยังไม่ได้กำหนดวัน'}
            hint="กดปุ่ม “ห้อง” และ “วัน” ด้านบน เพื่อกำหนดว่ารอบนี้มีห้องอะไรบ้าง และเรียนวันไหนบ้าง"
          />
        </div>
      ) : (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="bg-navy text-left text-xs font-semibold tracking-wide text-navy-foreground">
                <th className="w-32 px-3 py-2.5">วันที่</th>
                <th className="w-24 px-3 py-2.5">ห้อง</th>
                <th className="px-3 py-2.5">วิชา</th>
                <th className="px-3 py-2.5 text-center">ผู้สอน</th>
                <th className="px-3 py-2.5 text-center">สถาบัน</th>
              </tr>
            </thead>
            <tbody>
              {block.days.map((day, n) => (
                <DayRows
                  key={day.date}
                  shade={n % 2 === 1}
                  colorOf={colorOf}
                  date={day.date}
                  note={day.note}
                  rows={block.rows}
                  cells={cells}
                  checked={shared.checked}
                  isToday={day.date === today}
                  onCell={(row) => setCellOpen({ row, date: day.date })}
                  onMove={() => setMoving(day.date)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing === 'rows' ? (
        <RowsEditor block={block} {...shared} onClose={() => setEditing(null)} />
      ) : null}
      {editing === 'days' ? <DaysEditor block={block} onClose={() => setEditing(null)} /> : null}
      {cell ? (
        <CellEditor
          block={block}
          row={cell.row}
          date={cell.date}
          cells={cells}
          checked={shared.checked}
          groups={shared.groups}
          subjects={shared.subjects}
          onClose={() => setCellOpen(null)}
        />
      ) : null}
      {moving ? <MoveDayModal block={block} from={moving} onClose={() => setMoving(null)} /> : null}
    </Card>
  );
}

/** One วัน of the sheet: its banner (if it has a note), then one line per ห้อง. */
function DayRows({
  shade,
  colorOf,
  date,
  note,
  rows,
  cells,
  checked,
  isToday,
  onCell,
  onMove,
}: {
  /** every other วัน sits on a darker date column, so days read apart */
  shade: boolean;
  colorOf: Map<number, string>;
  date: string;
  note: string | null;
  rows: BlockRow[];
  cells: Map<string, ScheduleRow[]>;
  checked: Set<string>;
  isToday: boolean;
  onCell: (row: BlockRow) => void;
  onMove: () => void;
}) {
  return (
    <>
      {note ? (
        <tr>
          <td
            colSpan={5}
            className="border-b border-border bg-navy px-3 py-2 text-center text-sm font-bold"
          >
            <span className="rounded-full bg-[#F5C518] px-3 py-0.5 text-[#1e2a5e]">{note}</span>
          </td>
        </tr>
      ) : null}
      {rows.map((row, i) => {
        const here = cells.get(`${date}|${row.label}`) ?? [];
        const hex = here[0] ? colorOf.get(here[0].subjectId) : undefined;
        const clash = here.length > 1;
        const gradeHex = GRADE_HEX[gradeInLabel(row.label) ?? ''];
        const last = i === rows.length - 1;
        return (
          <tr key={row.id} className={cn(last && 'border-b-2 border-navy/40')}>
            {i === 0 ? (
              <td
                rowSpan={rows.length}
                className={cn(
                  'border-r border-b-2 border-r-border border-b-navy/40 px-3 py-2.5 align-top tabular-nums',
                  shade ? 'bg-secondary' : 'bg-secondary/50',
                  isToday && 'bg-primary/10 text-primary',
                )}
              >
                <div className="text-base font-bold">{thaiDateShort(date)}</div>
                <div className="text-xs text-muted-foreground">
                  วัน{THAI_WEEKDAYS_SHORT[weekdayOfYmd(date)]}
                </div>
                <button
                  type="button"
                  onClick={onMove}
                  className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                  title="ย้ายวันนี้ทั้งวันไปวันอื่น"
                >
                  <MoveRight className="size-3.5" strokeWidth={1.8} />
                  ย้ายวัน
                </button>
              </td>
            ) : null}
            <td className="border-b border-r border-border px-2.5 py-2 whitespace-nowrap">
              <span
                className="inline-block rounded-md px-2 py-0.5 text-sm font-semibold"
                style={
                  gradeHex
                    ? { backgroundColor: mixCard(gradeHex, 16), color: mixInk(gradeHex) }
                    : undefined
                }
              >
                {row.label}
              </span>
            </td>
            <td
              colSpan={3}
              className="border-b border-border p-0"
              style={
                clash
                  ? { backgroundColor: 'color-mix(in srgb, var(--destructive) 12%, var(--card))' }
                  : hex
                    ? { backgroundColor: mixCard(hex, 17) }
                    : undefined
              }
            >
              <button
                type="button"
                onClick={() => onCell(row)}
                className="grid w-full grid-cols-3 text-left transition-[filter] hover:brightness-95 dark:hover:brightness-110"
                title="กดเพื่อเลือกวิชา"
              >
                {here.length === 0 ? (
                  <span className="col-span-3 m-1 rounded-md border border-dashed border-border px-3 py-1.5 text-center text-xs text-muted-foreground hover:border-primary/50 hover:text-primary">
                    + เลือกวิชา
                  </span>
                ) : (
                  here.map((c) => (
                    <span key={c.sectionId} className="contents">
                      <span className="flex min-w-0 items-center gap-1.5 px-3 py-2">
                        {clash ? (
                          <TriangleAlert
                            className="size-4 shrink-0 text-destructive"
                            strokeWidth={1.9}
                          />
                        ) : null}
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{c.subjectName}</span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-xs">
                            <SubjectCode code={c.subjectCode} hex={colorOf.get(c.subjectId)} />
                            {checked.has(`${c.sectionId}:${date}`) ? (
                              <span className="text-success">✓ เช็คชื่อแล้ว</span>
                            ) : null}
                          </span>
                        </span>
                      </span>
                      <span className="flex items-center justify-center border-l border-foreground/10 px-3 py-2 text-center">
                        {c.teacherName ?? '—'}
                      </span>
                      <span className="flex items-center justify-center border-l border-foreground/10 px-3 py-2 text-center text-muted-foreground">
                        {c.institution ?? '—'}
                      </span>
                    </span>
                  ))
                )}
              </button>
            </td>
          </tr>
        );
      })}
    </>
  );
}

function SubjectCode({ code, hex }: { code: string; hex?: string }) {
  return (
    <span
      className="rounded px-1.5 font-semibold"
      style={hex ? { backgroundColor: mixCard(hex, 34), color: mixInk(hex) } : undefined}
    >
      {code}
    </span>
  );
}

/**
 * Pick the วิชา of one ห้อง's cells, or clear them — on the วัน pressed and
 * any other วัน of the รอบ ticked alongside it, since a วิชา often meets on
 * more than one day of a รอบ.
 */
function CellEditor({
  block,
  row,
  date,
  cells,
  checked,
  groups,
  subjects,
  onClose,
}: {
  block: ScheduleBlock;
  row: BlockRow;
  date: string;
  cells: Map<string, ScheduleRow[]>;
  checked: Set<string>;
  groups: ScheduleGroup[];
  subjects: ScheduleSubject[];
  onClose: () => void;
}) {
  const router = useRouter();
  const cellOf = (d: string) => cells.get(`${d}|${row.label}`) ?? [];
  const lockedOn = (d: string) => cellOf(d).some((c) => checked.has(`${c.sectionId}:${d}`));
  const [dates, setDates] = useState<string[]>([date]);
  const current = dates.flatMap(cellOf);
  const [subjectId, setSubjectId] = useState<number | null>(cellOf(date)[0]?.subjectId ?? null);
  const [saving, setSaving] = useState(false);
  // สร้างวิชาใหม่ — a ครู filling the sheet in meets a วิชา nobody has
  // catalogued yet far more often than a ผู้ดูแล does; making them leave for
  // หน้าวิชาเสริม and come back would lose the cell they were on.
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState({
    groupId: groups[0]?.id ?? 0,
    phase: 1,
    code: '',
    name: '',
    teacherName: '',
    institution: '',
  });
  // A checked-in day keeps its วิชา — it may be ticked, but only to keep that วิชา.
  const checkedDays = dates.filter(lockedOn);
  const locked = checkedDays.some((d) => cellOf(d).some((c) => c.subjectId !== subjectId));
  const clashes = dates.filter((d) => cellOf(d).length > 1);

  function toggleDate(d: string) {
    setDates((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d].sort()));
  }
  const picked = subjects.find((s) => s.id === subjectId) ?? null;
  // วิชาของภาคเรียนนี้ขึ้นก่อน — they are nearly always the one wanted.
  const ofTerm = subjects.filter((s) => s.semester === block.semester);
  const rest = subjects.filter((s) => s.semester !== block.semester);

  async function save(chosen: number | null) {
    if (saving) return;
    setSaving(true);
    let id = chosen;
    if (creating) {
      const made = await saveSubject(null, {
        ...fresh,
        description: '',
        semester: block.semester,
      });
      if (!made.ok || !made.id) {
        setSaving(false);
        toast.error(made.message);
        return;
      }
      toast.success(made.message);
      id = made.id;
      // Created now, whatever the cell does next — a second press must pick
      // it, not try to create the same รหัส again.
      setCreating(false);
      setSubjectId(id);
      router.refresh();
    }
    const r = await setCell({
      blockId: block.id,
      rowId: row.id,
      dates,
      subjectId: id,
    });
    setSaving(false);
    if (r.ok) {
      toast.success(r.message);
      onClose();
      router.refresh();
    } else toast.error(r.message);
  }

  const options = (list: ScheduleSubject[], prefix: string) =>
    groups.map((g) => {
      const items = list.filter((s) => s.groupId === g.id);
      return items.length ? (
        <optgroup key={`${prefix}${g.id}`} label={`${prefix}${g.code} · ${g.name}`}>
          {items.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} — {s.name}
            </option>
          ))}
        </optgroup>
      ) : null;
    });

  return (
    <Modal
      onClose={saving ? undefined : onClose}
      labelledBy="cell-title"
      className="max-w-lg"
      footer={
        <>
          {current.length ? (
            <Button
              variant="outline"
              onClick={() => save(null)}
              disabled={saving || checkedDays.length > 0}
              className="mr-auto text-destructive"
            >
              <X className="size-4.5" strokeWidth={1.9} />
              ล้างช่อง
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button
            onClick={() => save(subjectId)}
            disabled={
              saving ||
              locked ||
              dates.length === 0 ||
              (creating ? !fresh.code.trim() || !fresh.name.trim() || !fresh.groupId : !subjectId)
            }
          >
            {saving ? <Loader2 className="size-4.5 animate-spin" /> : null}
            {creating ? 'สร้างวิชาและบันทึก' : 'บันทึก'}
          </Button>
        </>
      }
    >
      <h2 id="cell-title" className="text-base font-semibold">
        {row.label} ·{' '}
        {dates.length === 1
          ? thaiDateLong(dates[0])
          : dates.length
            ? `${dates.length} วัน`
            : 'ยังไม่เลือกวัน'}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{block.name}</p>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <Label>วันเรียน</Label>
          {block.days.length > 1 ? (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() =>
                setDates(
                  dates.length === block.days.length ? [date] : block.days.map((d) => d.date),
                )
              }
            >
              {dates.length === block.days.length ? 'เหลือวันนี้วันเดียว' : 'เลือกทุกวันของรอบ'}
            </button>
          ) : null}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {block.days.map((d) => {
            const on = dates.includes(d.date);
            const here = cellOf(d.date);
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => toggleDate(d.date)}
                aria-pressed={on}
                className={cn(
                  'rounded-lg border px-2.5 py-1 text-left text-xs tabular-nums transition-colors',
                  on
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
                )}
              >
                <span className="font-medium">
                  {THAI_WEEKDAYS_SHORT[weekdayOfYmd(d.date)]} {thaiDateShort(d.date)}
                </span>
                {here.length ? (
                  <span className="ml-1.5 opacity-80">
                    {here.map((c) => c.subjectCode).join(', ')}
                    {lockedOn(d.date) ? ' ✓' : ''}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          กดเพื่อเลือกได้หลายวัน — วิชาที่เลือกจะลงช่องของห้อง {row.label} ทุกวันที่เลือก
        </p>
      </div>

      {clashes.length ? (
        <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          มีวิชาชนกันใน {clashes.map(thaiDateShort).join(', ')} — เลือกวิชาที่ถูกต้องแล้วบันทึก
          วิชาอื่นจะถูกเอาออกจากวันนั้น
        </p>
      ) : null}
      {checkedDays.length ? (
        <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
          {checkedDays.map(thaiDateShort).join(', ')} เช็คชื่อไปแล้ว
          จึงเปลี่ยนวิชาหรือล้างช่องของวันนั้นไม่ได้ — เอาวันนั้นออกจากที่เลือก หรือคงวิชาเดิมไว้
        </p>
      ) : null}

      {creating ? (
        <div className="mt-4 space-y-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">วิชาใหม่ · ภาคเรียนที่ {block.semester}</p>
            <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
              เลือกจากวิชาที่มีอยู่
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="new-group">กลุ่มวิชา</Label>
              <Select
                id="new-group"
                value={fresh.groupId}
                onChange={(e) => setFresh({ ...fresh, groupId: Number(e.target.value) })}
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.code} · {g.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="new-phase">ช่วง</Label>
              <Select
                id="new-phase"
                value={fresh.phase}
                onChange={(e) => setFresh({ ...fresh, phase: Number(e.target.value) })}
              >
                <option value={1}>ช่วงที่ 1</option>
                <option value={2}>ช่วงที่ 2</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="new-code">รหัสวิชา</Label>
              <Input
                id="new-code"
                value={fresh.code}
                onChange={(e) => setFresh({ ...fresh, code: e.target.value })}
                placeholder="เช่น SC201"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="new-name">ชื่อวิชา</Label>
              <Input
                id="new-name"
                value={fresh.name}
                onChange={(e) => setFresh({ ...fresh, name: e.target.value })}
                placeholder="เช่น เวชศาสตร์ชะลอวัย"
              />
            </div>
            <div>
              <Label htmlFor="new-teacher">ผู้สอน</Label>
              <Input
                id="new-teacher"
                value={fresh.teacherName}
                onChange={(e) => setFresh({ ...fresh, teacherName: e.target.value })}
                placeholder="เช่น อ.มนตรี ตั้งเวียงวัง"
              />
            </div>
            <div>
              <Label htmlFor="new-inst">สถาบัน</Label>
              <Input
                id="new-inst"
                value={fresh.institution}
                onChange={(e) => setFresh({ ...fresh, institution: e.target.value })}
                placeholder="เช่น มหาวิทยาลัยมหิดล"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <Label htmlFor="cell-subject">วิชา</Label>
          <Select
            id="cell-subject"
            value={subjectId ?? ''}
            onChange={(e) => setSubjectId(e.target.value ? Number(e.target.value) : null)}
            autoFocus
          >
            <option value="">— เลือกวิชา —</option>
            {options(ofTerm, `ภาคเรียนที่ ${block.semester} · `)}
            {options(rest, ofTerm.length ? 'วิชาอื่น · ' : '')}
          </Select>
          {checkedDays.length === 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-primary"
              onClick={() => setCreating(true)}
            >
              <BookPlus className="size-4" strokeWidth={1.9} />
              ไม่มีในรายการ? สร้างวิชาใหม่
            </Button>
          ) : null}
        </div>
      )}
      {picked && !creating ? (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">ผู้สอน</dt>
          <dd>{picked.teacherName ?? '—'}</dd>
          <dt className="text-muted-foreground">สถาบัน</dt>
          <dd>{picked.institution ?? '—'}</dd>
        </dl>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">
        บันทึกแล้วทุกวันที่เลือกจะเป็นวันเรียนของกลุ่ม “{row.label}” ในวิชานั้น —
        ถ้ายังไม่มีกลุ่มนี้ ระบบเปิดให้
        {row.source
          ? ' พร้อมใส่นักเรียนตามที่กำหนดไว้ที่ห้อง'
          : ' (ยังไม่มีนักเรียน — จัดต่อที่หน้าจัดนักเรียนเข้าวิชา)'}
      </p>
    </Modal>
  );
}

interface DraftRow {
  /** stable key while editing — the row's id, or a negative number for a new one */
  key: number;
  id: number | null;
  label: string;
  source: string;
}

/** The ห้อง of a รอบ: their names, order, and where their นักเรียน come from. */
function RowsEditor({
  block,
  homerooms,
  trackGroups,
  savedGroups,
  canPlace,
  onClose,
}: Shared & { block: ScheduleBlock; onClose: () => void }) {
  const router = useRouter();
  const [rows, setRows] = useState<DraftRow[]>(() =>
    block.rows.map((r) => ({
      key: r.id,
      id: r.id,
      label: r.label,
      source: sourceKey(r.source),
    })),
  );
  const [saving, setSaving] = useState(false);
  // New ห้อง get negative keys so they can never collide with a saved row's id.
  const lastKey = useRef(0);
  const newKey = () => --lastKey.current;

  const sources = useMemo(() => {
    const map = new Map<string, { label: string; source: ScheduleRowSource }>();
    for (const h of homerooms)
      map.set(`home:${h.gradeLevel}/${h.classroom}`, {
        label: `ห้อง ${h.gradeLevel}/${h.classroom} · ${h.studentCount} คน`,
        source: {
          kind: 'homeroom',
          gradeLevel: h.gradeLevel,
          classroom: h.classroom,
        },
      });
    for (const t of trackGroups.filter((t) => t.semester === block.semester))
      map.set(`track:${t.semester}:${t.trackId}${t.optionId ? `:${t.optionId}` : ''}`, {
        label: `${t.label} · ${t.studentCount} คน`,
        source: {
          kind: 'track',
          semester: t.semester,
          trackId: t.trackId,
          optionId: t.optionId,
        },
      });
    for (const g of savedGroups)
      map.set(`room:${g.id}`, {
        label: `${g.name} · ${g.studentCount} คน`,
        source: { kind: 'classroom', classroomId: g.id },
      });
    return map;
  }, [homerooms, trackGroups, savedGroups, block.semester]);

  const grades = [...new Set(homerooms.map((h) => h.gradeLevel))];

  function patch(key: number, p: Partial<DraftRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  }
  function move(i: number, by: number) {
    setRows((rs) => {
      const next = [...rs];
      const j = i + by;
      if (j < 0 || j >= next.length) return rs;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function addGrade(grade: string) {
    setRows((rs) => {
      const have = new Set(rs.map((r) => r.label));
      const fresh = homerooms
        .filter((h) => h.gradeLevel === grade && !have.has(homeroomLabel(h)))
        .map((h) => ({
          key: newKey(),
          id: null,
          label: homeroomLabel(h),
          source: canPlace ? `home:${h.gradeLevel}/${h.classroom}` : 'none',
        }));
      return [...rs, ...fresh];
    });
  }

  async function submit() {
    if (saving) return;
    setSaving(true);
    const r = await saveBlockRows({
      blockId: block.id,
      rows: rows.map((r) => ({
        id: r.id,
        label: r.label.trim(),
        source: sources.get(r.source)?.source ?? null,
      })),
    });
    setSaving(false);
    if (r.ok) {
      toast.success(r.message);
      onClose();
      router.refresh();
    } else toast.error(r.message);
  }

  return (
    <Modal
      onClose={saving ? undefined : onClose}
      closeOnBackdrop={false}
      labelledBy="rows-title"
      className="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="size-4.5 animate-spin" /> : null}
            บันทึกห้อง
          </Button>
        </>
      }
    >
      <h2 id="rows-title" className="text-base font-semibold">
        ห้องของ “{block.name}”
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        ห้องคือแถวของตาราง เช่น ม.4-1 — ชื่อห้องจะเป็นชื่อกลุ่มเรียนของทุกวิชาที่จัดลงช่อง
      </p>

      {grades.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">เพิ่มห้องประจำชั้นทั้งระดับ:</span>
          {grades.map((g) => (
            <Button key={g} variant="outline" size="sm" onClick={() => addGrade(g)}>
              <Plus className="size-3.5" strokeWidth={1.9} />
              {g}
            </Button>
          ))}
        </div>
      ) : null}

      <ul className="mt-3 space-y-2">
        {rows.map((r, i) => (
          <li key={r.key} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <Input
              value={r.label}
              onChange={(e) => patch(r.key, { label: e.target.value })}
              placeholder="ชื่อห้อง เช่น ม.4-1"
              className="h-10 w-full sm:w-40"
              aria-label="ชื่อห้อง"
            />
            {canPlace ? (
              <Select
                value={sources.has(r.source) ? r.source : 'none'}
                onChange={(e) => patch(r.key, { source: e.target.value })}
                className="h-10 min-w-0 flex-1"
                aria-label="นักเรียนของห้องนี้"
              >
                <option value="none">นักเรียน: ไม่ดึงอัตโนมัติ</option>
                {[
                  ['ห้องประจำชั้น', 'home:'],
                  [`Track ภาคเรียนที่ ${block.semester}`, 'track:'],
                  ['กลุ่มเรียนพิเศษ', 'room:'],
                ].map(([label, prefix]) => {
                  const items = [...sources].filter(([k]) => k.startsWith(prefix));
                  return items.length ? (
                    <optgroup key={prefix} label={label}>
                      {items.map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : null;
                })}
              </Select>
            ) : (
              <span className="flex-1" />
            )}
            <div className="flex shrink-0 items-center">
              <IconButton label="ขึ้น" onClick={() => move(i, -1)} disabled={i === 0}>
                <ArrowUp className="size-4" strokeWidth={1.9} />
              </IconButton>
              <IconButton label="ลง" onClick={() => move(i, 1)} disabled={i === rows.length - 1}>
                <ArrowDown className="size-4" strokeWidth={1.9} />
              </IconButton>
              <IconButton
                label="ลบห้องนี้"
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                danger
              >
                <Trash2 className="size-4" strokeWidth={1.9} />
              </IconButton>
            </div>
          </li>
        ))}
      </ul>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2"
        onClick={() =>
          setRows((rs) => [...rs, { key: newKey(), id: null, label: '', source: 'none' }])
        }
      >
        <Plus className="size-4" strokeWidth={1.9} />
        เพิ่มห้อง
      </Button>
      {canPlace ? (
        <p className="mt-3 text-xs text-muted-foreground">
          “นักเรียน” ใช้ตอนที่ระบบเปิดกลุ่มเรียนใหม่จากช่องในตาราง — กลุ่มจะได้นักเรียนชุดนั้นทันที
          ส่วนกลุ่มที่มีอยู่แล้วไม่ถูกแตะ
        </p>
      ) : null}
    </Modal>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-30',
        danger && 'hover:bg-destructive/10 hover:text-destructive',
      )}
    >
      {children}
    </button>
  );
}

/** The วัน of a รอบ — picked on the calendar, each with an optional banner. */
function DaysEditor({ block, onClose }: { block: ScheduleBlock; onClose: () => void }) {
  const router = useRouter();
  const [days, setDays] = useState(() =>
    block.days.map((d) => ({ date: d.date, note: d.note ?? '' })),
  );
  const [saving, setSaving] = useState(false);

  function toggle(date: string) {
    setDays((ds) =>
      ds.some((d) => d.date === date)
        ? ds.filter((d) => d.date !== date)
        : [...ds, { date, note: '' }].sort((a, b) => a.date.localeCompare(b.date)),
    );
  }

  async function submit() {
    if (saving) return;
    setSaving(true);
    const r = await saveBlockDays({ blockId: block.id, days });
    setSaving(false);
    if (r.ok) {
      toast.success(r.message);
      onClose();
      router.refresh();
    } else toast.error(r.message);
  }

  return (
    <Modal
      onClose={saving ? undefined : onClose}
      closeOnBackdrop={false}
      labelledBy="days-title"
      className="max-w-3xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="size-4.5 animate-spin" /> : null}
            บันทึกวัน
          </Button>
        </>
      }
    >
      <h2 id="days-title" className="text-base font-semibold">
        วันของ “{block.name}”
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        กดวันที่บนปฏิทินเพื่อเพิ่มหรือเอาออก — ใส่ข้อความแถบหัวได้ เช่น “อ่านหนังสือสอบกลางภาคเรียน”
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-[320px_minmax(0,1fr)] sm:items-start">
        <ThaiCalendar selected={days.map((d) => d.date)} onToggle={toggle} />
        {days.length === 0 ? (
          <p className="text-xs text-muted-foreground">ยังไม่ได้เลือกวัน</p>
        ) : (
          <ul className="space-y-2">
            {days.map((d) => (
              <li key={d.date} className="flex items-center gap-2">
                <span className="w-32 shrink-0 text-sm tabular-nums">
                  {THAI_WEEKDAYS_SHORT[weekdayOfYmd(d.date)]} {thaiDateShort(d.date)}
                </span>
                <Input
                  value={d.note}
                  onChange={(e) =>
                    setDays((ds) =>
                      ds.map((x) => (x.date === d.date ? { ...x, note: e.target.value } : x)),
                    )
                  }
                  placeholder="ข้อความแถบหัว (ไม่บังคับ)"
                  className="h-9 min-w-0 flex-1"
                />
                <IconButton label="เอาวันนี้ออก" onClick={() => toggle(d.date)} danger>
                  <X className="size-4" strokeWidth={1.9} />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

/** Slide one วัน — and every วิชา on it — to another date. */
function MoveDayModal({
  block,
  from,
  onClose,
}: {
  block: ScheduleBlock;
  from: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [to, setTo] = useState(from);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (saving) return;
    setSaving(true);
    const r = await moveBlockDay({ blockId: block.id, from, to });
    setSaving(false);
    if (r.ok) {
      toast.success(r.message);
      onClose();
      router.refresh();
    } else toast.error(r.message);
  }

  return (
    <Modal
      onClose={saving ? undefined : onClose}
      labelledBy="move-block-day"
      className="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button onClick={submit} disabled={saving || to === from}>
            {saving ? (
              <Loader2 className="size-4.5 animate-spin" />
            ) : (
              <MoveRight className="size-4.5" strokeWidth={1.8} />
            )}
            ย้ายทั้งวัน
          </Button>
        </>
      }
    >
      <h2 id="move-block-day" className="text-base font-semibold">
        ย้ายวัน · {block.name}
      </h2>
      <p className="mt-3 text-sm">
        จาก <span className="font-medium">{thaiDateLong(from)}</span> ไปเป็น{' '}
        <span className="font-medium text-primary">{thaiDateLong(to)}</span>
      </p>
      <div className="mt-3">
        <ThaiCalendar selected={[to]} onToggle={setTo} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        ทุกห้องของวันนี้ย้ายไปพร้อมกัน — ถ้ามีห้องใดเช็คชื่อไปแล้ว จะย้ายไม่ได้ทั้งวัน
      </p>
    </Modal>
  );
}
