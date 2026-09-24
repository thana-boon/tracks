'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  CalendarDays,
  CalendarRange,
  ChevronsDownUp,
  ChevronsUpDown,
  ClipboardPen,
  Loader2,
  MapPin,
  MoveRight,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardHeader, EmptyState, Input, Label, Select } from '@/components/ui';
import { Modal, useDialog } from '@/components/dialog';
import { ThaiCalendar, SelectedDates } from '@/components/thai-calendar';
import {
  cn,
  compareClassLabels,
  thaiDateLong,
  thaiMonthLabel,
  todayYmd,
  weekdayOfYmd,
  THAI_WEEKDAYS_SHORT,
} from '@/lib/utils';
import type { ScheduleRow } from '@/lib/schedule';
import { addClassDays, moveClassDay, removeClassDay } from './actions';

export interface ScheduleGroup {
  id: number;
  code: string;
  name: string;
}

export interface ScheduleSubject {
  id: number;
  code: string;
  name: string;
  teacherName: string | null;
  semester: number | null;
  phase: number | null;
  groupId: number;
  groupCode: string;
  groupName: string;
}

/** A รอบเรียน of this year as the third field offers it. */
export interface ScheduleSection {
  id: number;
  name: string;
  room: string | null;
  subjectId: number;
  studentCount: number;
}

/** What the add form is holding before it is saved. */
interface Draft {
  subjectId: number | null;
  /** an existing รอบ, or null for "เปิดกลุ่มใหม่" */
  sectionId: number | null;
  newName: string;
  room: string;
  dates: string[];
}

const EMPTY_DRAFT: Draft = { subjectId: null, sectionId: null, newName: '', room: '', dates: [] };

/**
 * ตารางเรียนทั้งปี — the year's class days as one list, and a three-field form
 * that adds to it: วันที่, วิชา, กลุ่มเรียน.
 *
 * The list is read far more often than it is written (it exists to answer "what
 * runs in ภาคเรียนที่ 2?"), so the form sits at the top as one row and the list
 * takes the rest of the screen, filtered rather than paged — a year is a few
 * hundred lines, which is a scroll, not a query.
 */
export function ScheduleManager({
  yearLabel,
  rows,
  checkedKeys,
  groups,
  subjects,
  sections,
}: {
  yearLabel: string;
  rows: ScheduleRow[];
  checkedKeys: string[];
  groups: ScheduleGroup[];
  subjects: ScheduleSubject[];
  sections: ScheduleSection[];
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const router = useRouter();
  const checked = useMemo(() => new Set(checkedKeys), [checkedKeys]);

  if (subjects.length === 0) {
    return (
      <div className="space-y-6">
        <Header yearLabel={yearLabel} />
        <EmptyState
          icon={<CalendarRange className="size-8" strokeWidth={1.5} />}
          title="ยังไม่มีวิชาเสริมที่เปิดใช้งาน"
          hint="เพิ่มวิชาในหน้า “วิชาเสริม” ก่อน จึงจะวางตารางเรียนได้"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header yearLabel={yearLabel} />

      <AddRow
        draft={draft}
        onDraft={setDraft}
        groups={groups}
        subjects={subjects}
        sections={sections}
        onDone={() => {
          setDraft(EMPTY_DRAFT);
          router.refresh();
        }}
      />

      <ScheduleTable
        rows={rows}
        checked={checked}
        groups={groups}
        onChanged={() => router.refresh()}
      />

      <UnscheduledSections
        sections={sections}
        subjects={subjects}
        rows={rows}
        onPick={(s) =>
          setDraft({
            subjectId: s.subjectId,
            sectionId: s.id,
            newName: '',
            room: s.room ?? '',
            dates: [],
          })
        }
      />
    </div>
  );
}

function Header({ yearLabel }: { yearLabel: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ตารางเรียนทั้งปี</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          วันเรียนทุกวันของ {yearLabel} — วันที่ · วิชา · กลุ่มเรียน ·
          ใช้ข้อมูลชุดเดียวกับหน้าจัดนักเรียนเข้าวิชา แก้ที่ไหนก็ตรงกันทั้งสองหน้า
        </p>
      </div>
      <Link
        href="/admin/register"
        className="group inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm font-medium transition-colors hover:border-primary/35 hover:bg-secondary/60"
      >
        <ClipboardPen className="size-4.5 text-muted-foreground" strokeWidth={1.8} />
        ไปหน้าจัดนักเรียนเข้าวิชา
        <ArrowUpRight
          className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          strokeWidth={1.8}
        />
      </Link>
    </div>
  );
}

/**
 * The three fields, side by side: pick the day(s), pick the วิชา, pick the
 * กลุ่ม — or open a new one right here, since a timetable is normally drawn
 * before anybody has been placed in it.
 *
 * The calendar takes several days at once because that is how a ช่วง is
 * entered: one วิชา meets the same กลุ่ม on four Fridays, and four separate
 * saves is three presses of pure ceremony.
 */
function AddRow({
  draft,
  onDraft,
  groups,
  subjects,
  sections,
  onDone,
}: {
  draft: Draft;
  onDraft: (d: Draft) => void;
  groups: ScheduleGroup[];
  subjects: ScheduleSubject[];
  sections: ScheduleSection[];
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [openCalendar, setOpenCalendar] = useState(false);

  const subject = subjects.find((s) => s.id === draft.subjectId) ?? null;
  const forSubject = useMemo(
    () =>
      sections
        .filter((s) => s.subjectId === draft.subjectId)
        .sort((a, b) => compareClassLabels(a.name, b.name)),
    [sections, draft.subjectId],
  );

  function toggleDate(d: string) {
    onDraft({
      ...draft,
      dates: draft.dates.includes(d)
        ? draft.dates.filter((x) => x !== d)
        : [...draft.dates, d].sort(),
    });
  }

  async function submit() {
    if (saving) return;
    if (!draft.subjectId) {
      toast.error('เลือกวิชาก่อน');
      return;
    }
    if (draft.dates.length === 0) {
      toast.error('เลือกวันที่อย่างน้อย 1 วัน');
      return;
    }
    setSaving(true);
    const r = await addClassDays({
      subjectId: draft.subjectId,
      sectionId: draft.sectionId,
      newSectionName: draft.newName,
      room: draft.room,
      dates: draft.dates,
    });
    setSaving(false);
    if (r.ok) {
      toast.success(r.message);
      setOpenCalendar(false);
      onDone();
    } else {
      toast.error(r.message);
    }
  }

  const dateLabel =
    draft.dates.length === 0
      ? 'เลือกวันที่'
      : draft.dates.length === 1
        ? thaiDateLong(draft.dates[0])
        : `${thaiDateLong(draft.dates[0])} +${draft.dates.length - 1} วัน`;

  return (
    <Card>
      <CardHeader
        icon={<Plus className="size-4.5" strokeWidth={1.8} />}
        title="เพิ่มวันเรียนลงตาราง"
        action={draft.dates.length ? <Badge tone="primary">{draft.dates.length} วัน</Badge> : null}
      />

      <div className="grid gap-3 px-4 pb-4 sm:px-5 sm:pb-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_auto] lg:items-end">
        {/* ① วัน */}
        <div className="min-w-0">
          <Label htmlFor="sc-date">วันที่</Label>
          <button
            id="sc-date"
            type="button"
            onClick={() => setOpenCalendar((v) => !v)}
            aria-expanded={openCalendar}
            className={cn(
              'flex h-11 w-full items-center gap-2 rounded-lg border border-input bg-card px-3.5 text-left text-sm transition-colors hover:bg-secondary/40',
              draft.dates.length === 0 && 'text-muted-foreground',
            )}
          >
            <CalendarDays className="size-4.5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
            <span className="min-w-0 flex-1 truncate">{dateLabel}</span>
          </button>
        </div>

        {/* ② วิชา */}
        <div className="min-w-0">
          <Label htmlFor="sc-subject">วิชา</Label>
          <Select
            id="sc-subject"
            value={draft.subjectId ?? ''}
            onChange={(e) =>
              onDraft({
                ...draft,
                subjectId: e.target.value ? Number(e.target.value) : null,
                // A กลุ่ม belongs to one วิชา — changing the วิชา cannot keep it.
                sectionId: null,
                newName: '',
                room: '',
              })
            }
          >
            <option value="">— เลือกวิชา —</option>
            {groups.map((g) => (
              <optgroup key={g.id} label={`${g.code} · ${g.name}`}>
                {subjects
                  .filter((s) => s.groupId === g.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
        </div>

        {/* ③ กลุ่มที่เรียน */}
        <div className="min-w-0">
          <Label htmlFor="sc-section">กลุ่มที่เรียน</Label>
          <Select
            id="sc-section"
            value={draft.sectionId ?? 'new'}
            onChange={(e) =>
              onDraft({
                ...draft,
                sectionId: e.target.value === 'new' ? null : Number(e.target.value),
              })
            }
            disabled={!subject}
          >
            {forSubject.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.room ? ` · ${s.room}` : ''} · {s.studentCount} คน
              </option>
            ))}
            <option value="new">
              {forSubject.length === 0 ? '— ยังไม่มีกลุ่ม: เปิดกลุ่มใหม่ —' : '+ เปิดกลุ่มใหม่'}
            </option>
          </Select>
        </div>

        <Button onClick={submit} disabled={saving} className="lg:min-w-36">
          {saving ? (
            <Loader2 className="size-4.5 animate-spin" />
          ) : (
            <Plus className="size-4.5" strokeWidth={1.9} />
          )}
          เพิ่มลงตาราง
        </Button>
      </div>

      {/* Opening a new กลุ่ม only asks for what a กลุ่ม cannot be without — the
          rest (นักเรียน) is the other screen's job, and this one says so. */}
      {subject && draft.sectionId === null ? (
        <div className="grid gap-3 border-t border-border/60 bg-secondary/20 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end sm:px-5">
          <div className="min-w-0">
            <Label htmlFor="sc-name">
              ชื่อกลุ่มใหม่ <span className="font-normal text-muted-foreground">(ไม่บังคับ)</span>
            </Label>
            <Input
              id="sc-name"
              value={draft.newName}
              onChange={(e) => onDraft({ ...draft, newName: e.target.value })}
              placeholder="เช่น ม.4 กลุ่มเรียนที่ 1 — เว้นว่างได้ ระบบตั้งจากวันเรียนให้"
            />
          </div>
          <div className="min-w-0">
            <Label htmlFor="sc-room">ห้องที่เรียน</Label>
            <Input
              id="sc-room"
              value={draft.room}
              onChange={(e) => onDraft({ ...draft, room: e.target.value })}
              placeholder="เช่น อาคาร 3 ห้อง 312"
            />
          </div>
          <p className="text-xs text-muted-foreground sm:pb-3">
            กลุ่มใหม่จะยังไม่มีนักเรียน — เลือกนักเรียนต่อที่หน้าจัดนักเรียนเข้าวิชา
          </p>
        </div>
      ) : null}

      {openCalendar ? (
        <div className="border-t border-border/60 px-4 py-4 sm:px-5">
          <div className="grid gap-4 sm:grid-cols-[340px_minmax(0,1fr)] sm:items-start">
            <ThaiCalendar selected={draft.dates} onToggle={toggleDate} />
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                กดวันที่เพื่อเลือก เลือกได้หลายวันในครั้งเดียว — ทุกวันที่เลือกจะถูกใส่ให้กลุ่มเดียวกัน
              </p>
              <SelectedDates dates={draft.dates} onRemove={toggleDate} />
              {draft.dates.length ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDraft({ ...draft, dates: [] })}
                  className="text-muted-foreground"
                >
                  ล้างวันที่เลือก
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

/** One month of the year, and its class days in date order. */
interface MonthBucket {
  key: string;
  rows: ScheduleRow[];
  days: number;
}

/**
 * The year itself: every class day, newest month last, folded by month.
 *
 * Folded by month rather than by วิชา because the question this screen answers
 * is "what happens in สิงหาคม?" — the by-วิชา reading is what
 * จัดนักเรียนเข้าวิชา already gives, and duplicating it here would just be a
 * second place to look for the same answer.
 */
function ScheduleTable({
  rows,
  checked,
  groups,
  onChanged,
}: {
  rows: ScheduleRow[];
  checked: Set<string>;
  groups: ScheduleGroup[];
  onChanged: () => void;
}) {
  const [groupId, setGroupId] = useState<number | 'all'>('all');
  const [semester, setSemester] = useState<string>('all');
  const [month, setMonth] = useState<string>('all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [moving, setMoving] = useState<ScheduleRow | null>(null);
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const dialog = useDialog();

  const months = useMemo(
    () => [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort(),
    [rows],
  );

  const needle = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      rows.filter((r) => {
        if (groupId !== 'all' && r.groupId !== groupId) return false;
        if (semester !== 'all' && String(r.semester ?? '') !== semester) return false;
        if (month !== 'all' && r.date.slice(0, 7) !== month) return false;
        if (!needle) return true;
        return (
          r.subjectCode.toLowerCase().includes(needle) ||
          r.subjectName.toLowerCase().includes(needle) ||
          r.sectionName.toLowerCase().includes(needle) ||
          (r.room ?? '').toLowerCase().includes(needle) ||
          (r.teacherName ?? '').toLowerCase().includes(needle)
        );
      }),
    [rows, groupId, semester, month, needle],
  );

  const buckets = useMemo(() => {
    const by = new Map<string, MonthBucket>();
    for (const r of shown) {
      const key = r.date.slice(0, 7);
      const b = by.get(key) ?? { key, rows: [], days: 0 };
      b.rows.push(r);
      by.set(key, b);
    }
    const list = [...by.values()].sort((a, b) => a.key.localeCompare(b.key));
    for (const b of list) b.days = new Set(b.rows.map((r) => r.date)).size;
    return list;
  }, [shown]);

  const allFolded = buckets.length > 0 && buckets.every((b) => folded.has(b.key));
  const sectionsShown = new Set(shown.map((r) => r.sectionId)).size;

  async function remove(r: ScheduleRow) {
    const key = `${r.sectionId}:${r.date}`;
    if (busy) return;
    const ok = await dialog.confirm({
      title: `เอา ${thaiDateLong(r.date)} ออกจาก “${r.sectionName}”?`,
      description:
        'วันเรียนนี้จะหายไปจากตารางและจากหน้าจัดนักเรียนเข้าวิชา — กลุ่มและรายชื่อนักเรียนยังอยู่',
      detail: [`${r.subjectCode} ${r.subjectName}`, r.room ?? 'ยังไม่ระบุห้อง'],
      tone: 'destructive',
      confirmLabel: 'เอาวันนี้ออก',
    });
    if (!ok) return;
    setBusy(key);
    const res = await removeClassDay({ sectionId: r.sectionId, date: r.date });
    setBusy(null);
    if (res.ok) {
      toast.success(res.message);
      onChanged();
    } else {
      toast.error(res.message);
    }
  }

  return (
    <>
      <Card>
        <div className="sticky top-16 z-20 rounded-t-2xl border-b border-border/60 bg-card/95 backdrop-blur">
          <CardHeader
            icon={<CalendarRange className="size-4.5" strokeWidth={1.8} />}
            title="ตารางทั้งปี"
            action={
              <Badge tone="secondary">
                {shown.length === rows.length
                  ? `${rows.length} วันเรียน · ${sectionsShown} กลุ่ม`
                  : `${shown.length}/${rows.length} วันเรียน · ${sectionsShown} กลุ่ม`}
              </Badge>
            }
          />

          <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-5">
            <div className="relative min-w-40 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                strokeWidth={1.8}
              />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหารหัส / ชื่อวิชา / ชื่อกลุ่ม / ห้อง / ครู"
                className="h-10 pl-9"
              />
            </div>
            <Select
              value={String(groupId)}
              onChange={(e) => setGroupId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="h-10 w-40"
            >
              <option value="all">ทุกหมวด</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.code} · {g.name}
                </option>
              ))}
            </Select>
            <Select
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              className="h-10 w-36"
            >
              <option value="all">ทุกภาคเรียน</option>
              <option value="1">ภาคเรียนที่ 1</option>
              <option value="2">ภาคเรียนที่ 2</option>
              <option value="">ยังไม่ระบุภาค</option>
            </Select>
            <Select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-10 w-44"
              disabled={months.length === 0}
            >
              <option value="all">ทุกเดือน</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {thaiMonthLabel(m)}
                </option>
              ))}
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-10"
              onClick={() =>
                setFolded(allFolded ? new Set() : new Set(buckets.map((b) => b.key)))
              }
              disabled={buckets.length === 0}
            >
              {allFolded ? (
                <ChevronsUpDown className="size-4" strokeWidth={1.9} />
              ) : (
                <ChevronsDownUp className="size-4" strokeWidth={1.9} />
              )}
              {allFolded ? 'ขยายทั้งหมด' : 'ย่อทั้งหมด'}
            </Button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-4 sm:p-5">
            <EmptyState
              icon={<CalendarRange className="size-8" strokeWidth={1.5} />}
              title="ยังไม่มีวันเรียนในปีนี้"
              hint="ใส่วันที่ เลือกวิชา แล้วเลือกกลุ่มด้านบน — วันที่เพิ่มจะไปปรากฏที่หน้าจัดนักเรียนเข้าวิชาทันที"
            />
          </div>
        ) : buckets.length === 0 ? (
          <div className="p-4 sm:p-5">
            <EmptyState
              title="ไม่พบวันเรียนตามเงื่อนไข"
              hint="ลองล้างคำค้น หรือตัวกรองหมวด ภาคเรียน และเดือน"
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {buckets.map((b) => (
              <MonthBlock
                key={b.key}
                bucket={b}
                open={!folded.has(b.key)}
                checked={checked}
                busy={busy}
                onToggle={() =>
                  setFolded((prev) => {
                    const next = new Set(prev);
                    next.has(b.key) ? next.delete(b.key) : next.add(b.key);
                    return next;
                  })
                }
                onMove={setMoving}
                onRemove={remove}
              />
            ))}
          </ul>
        )}
      </Card>

      {moving ? (
        <MoveDayModal
          row={moving}
          onClose={() => setMoving(null)}
          onDone={() => {
            setMoving(null);
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}

function MonthBlock({
  bucket,
  open,
  checked,
  busy,
  onToggle,
  onMove,
  onRemove,
}: {
  bucket: MonthBucket;
  open: boolean;
  checked: Set<string>;
  busy: string | null;
  onToggle: () => void;
  onMove: (r: ScheduleRow) => void;
  onRemove: (r: ScheduleRow) => void;
}) {
  // Within a month the lines run date-first: the point of the screen is the
  // order the year happens in, not the order the catalogue is printed in.
  const rows = [...bucket.rows].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.groupCode.localeCompare(b.groupCode, 'th', { numeric: true }) ||
      a.subjectCode.localeCompare(b.subjectCode, 'th', { numeric: true }) ||
      compareClassLabels(a.sectionName, b.sectionName),
  );
  const today = todayYmd();

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-secondary/40 sm:px-5',
          open && 'bg-secondary/30',
        )}
      >
        <CalendarDays className="size-4.5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
        <span className="font-semibold">{thaiMonthLabel(bucket.key)}</span>
        <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
          {bucket.days} วัน · {rows.length} รายการ
        </span>
      </button>

      {open ? (
        <ul className="border-t border-border/60">
          {rows.map((r, i) => {
            const key = `${r.sectionId}:${r.date}`;
            const isChecked = checked.has(key);
            // The date is printed once per day, not once per line: a day with
            // five วิชา on it reads as one day, the way a timetable does.
            const newDay = i === 0 || rows[i - 1].date !== r.date;
            return (
              <li
                key={`${key}:${r.subjectId}`}
                className={cn(
                  'flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 hover:bg-secondary/30 sm:px-5',
                  newDay ? 'border-t border-border/40 first:border-t-0' : '',
                )}
              >
                <div
                  className={cn(
                    'w-36 shrink-0 text-sm tabular-nums',
                    newDay ? 'font-medium' : 'text-transparent',
                    newDay && r.date === today && 'text-primary',
                  )}
                >
                  {THAI_WEEKDAYS_SHORT[weekdayOfYmd(r.date)]} {thaiDateLong(r.date)}
                </div>

                <Badge tone="primary" className="shrink-0">
                  {r.groupCode}
                </Badge>
                <span className="shrink-0 text-sm font-medium">{r.subjectCode}</span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {r.subjectName}
                  {r.teacherName ? (
                    <span className="text-muted-foreground"> · ครู {r.teacherName}</span>
                  ) : null}
                </span>

                <Badge tone="navy" className="shrink-0">
                  {r.sectionName}
                </Badge>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="size-3.5" strokeWidth={1.8} />
                  {r.room ?? 'ยังไม่ระบุห้อง'}
                </span>

                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  {isChecked ? <Badge tone="success">เช็คชื่อแล้ว</Badge> : null}
                  <button
                    onClick={() => onMove(r)}
                    disabled={isChecked}
                    title={isChecked ? 'เช็คชื่อไปแล้ว — ย้ายวันไม่ได้' : 'ย้ายไปวันอื่น'}
                    className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                  >
                    <MoveRight className="size-4.5" strokeWidth={1.8} />
                  </button>
                  <button
                    onClick={() => onRemove(r)}
                    disabled={isChecked || busy === key}
                    title={isChecked ? 'เช็คชื่อไปแล้ว — ลบวันนี้ไม่ได้' : 'เอาวันนี้ออกจากตาราง'}
                    className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
                  >
                    {busy === key ? (
                      <Loader2 className="size-4.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-4.5" strokeWidth={1.8} />
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

/** Move one line to another date — the calendar, one day, one press. */
function MoveDayModal({
  row,
  onClose,
  onDone,
}: {
  row: ScheduleRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [to, setTo] = useState<string>(row.date);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (saving) return;
    setSaving(true);
    const r = await moveClassDay({ sectionId: row.sectionId, from: row.date, to });
    setSaving(false);
    if (r.ok) {
      toast.success(r.message);
      onDone();
    } else {
      toast.error(r.message);
    }
  }

  return (
    <Modal
      onClose={saving ? undefined : onClose}
      labelledBy="move-day-title"
      className="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button onClick={submit} disabled={saving || to === row.date} className="min-w-32">
            {saving ? (
              <Loader2 className="size-4.5 animate-spin" />
            ) : (
              <MoveRight className="size-4.5" strokeWidth={1.8} />
            )}
            ย้ายวันเรียน
          </Button>
        </>
      }
    >
      <h2 id="move-day-title" className="text-base font-semibold">
        ย้ายวันเรียน
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {row.subjectCode} {row.subjectName} · กลุ่ม “{row.sectionName}”
      </p>
      <p className="mt-3 text-sm">
        จาก <span className="font-medium">{thaiDateLong(row.date)}</span> ไปเป็น{' '}
        <span className="font-medium text-primary">{thaiDateLong(to)}</span>
      </p>
      <div className="mt-3">
        <ThaiCalendar selected={[to]} onToggle={(d) => setTo(d)} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        กลุ่มและรายชื่อนักเรียนไม่เปลี่ยน — ย้ายเฉพาะวันที่ และหน้าจัดนักเรียนเข้าวิชากับหน้าเช็คชื่อจะเห็นวันใหม่ทันที
      </p>
    </Modal>
  );
}

/**
 * รอบเรียน that exist but have no day on the calendar yet.
 *
 * Invisible in the list above by definition — a schedule screen shows days —
 * yet they are exactly what somebody has come here to fix, and a กลุ่ม with no
 * วันเรียน can never be checked in. Pressing one loads it into the form above.
 */
function UnscheduledSections({
  sections,
  subjects,
  rows,
  onPick,
}: {
  sections: ScheduleSection[];
  subjects: ScheduleSubject[];
  rows: ScheduleRow[];
  onPick: (s: ScheduleSection) => void;
}) {
  const scheduled = useMemo(() => new Set(rows.map((r) => r.sectionId)), [rows]);
  const missing = sections.filter((s) => !scheduled.has(s.id));
  if (missing.length === 0) return null;

  const subjectOf = new Map(subjects.map((s) => [s.id, s]));

  return (
    <Card>
      <CardHeader
        icon={<Users className="size-4.5" strokeWidth={1.8} />}
        title="กลุ่มที่ยังไม่มีวันเรียน"
        action={<Badge tone="secondary">{missing.length} กลุ่ม</Badge>}
      />
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">
        <p className="mb-3 text-xs text-muted-foreground">
          กลุ่มเหล่านี้เปิดไว้แล้วแต่ยังไม่มีวันเรียน จึงยังเช็คชื่อไม่ได้ — กดเพื่อใส่วันให้ในแบบฟอร์มด้านบน
        </p>
        <ul className="flex flex-wrap gap-2">
          {missing.map((s) => {
            const subject = subjectOf.get(s.subjectId);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onPick(s)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/35 hover:bg-secondary/60"
                >
                  {subject ? `${subject.code} · ` : ''}
                  {s.name}
                  <span className="tabular-nums text-muted-foreground">{s.studentCount} คน</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
