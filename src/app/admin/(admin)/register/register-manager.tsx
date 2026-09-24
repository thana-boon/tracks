'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ClipboardPen,
  CalendarDays,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Save,
  Search,
  Users,
  UsersRound,
  Plus,
  Pencil,
  Trash2,
  TableProperties,
  MapPin,
  Loader2,
  Route,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Card,
  CardHeader,
  Button,
  Select,
  Input,
  Label,
  Badge,
  EmptyState,
} from '@/components/ui';
import { Modal, useDialog } from '@/components/dialog';
import { StudentPicker, type PickStudent } from '@/components/student-picker';
import { ThaiCalendar, SelectedDates } from '@/components/thai-calendar';
import {
  cn,
  compareClassLabels,
  gradeInLabel,
  sortGrades,
  thaiDateLong,
  thaiDateShort,
  weekdayOfYmd,
  THAI_WEEKDAYS_SHORT,
} from '@/lib/utils';
import { saveSection, deleteSection, createGroupFromSelection } from './actions';

export interface RegisterGroup {
  id: number;
  code: string;
  name: string;
}

export interface RegisterSubject {
  id: number;
  code: string;
  name: string;
  teacherName: string | null;
  groupId: number;
  groupCode: string;
  groupName: string;
}

/** A รอบเรียน as the overview table and the editor see it. */
export interface RegisterSection {
  id: number;
  name: string;
  room: string | null;
  subjectId: number;
  subjectCode: string;
  subjectName: string;
  teacherName: string | null;
  groupId: number;
  groupCode: string;
  groupName: string;
  classDates: string[];
  memberIds: number[];
  studentCount: number;
  /** class days already checked in — a รอบ with these cannot be deleted */
  checkedDays: number;
}

/** A saved ห้องเรียนพิเศษ, reusable as a ready-made student selection. */
export interface StudentGroup {
  id: number;
  name: string;
  note: string | null;
  memberIds: number[];
}

/**
 * A สายการเรียน of this ปีการศึกษา, offered as a ready-made selection.
 *
 * One entry per สาย and one per ข้อย่อย, each already narrowed to นักเรียน who
 * are still studying — the register screen only has to drop the ids in.
 */
export interface TrackSource {
  key: string;
  semester: number;
  trackName: string;
  /** set when the entry is one แขนง rather than the whole สาย */
  optionName: string | null;
  memberIds: number[];
}

/** What the editor is working on: a brand-new รอบ, or an existing one. */
type Draft = { mode: 'create' } | { mode: 'edit'; section: RegisterSection };

export function RegisterManager({
  yearLabel,
  groups,
  subjects,
  sections,
  students,
  studentGroups,
  trackSources,
}: {
  yearLabel: string;
  groups: RegisterGroup[];
  subjects: RegisterSubject[];
  sections: RegisterSection[];
  students: PickStudent[];
  studentGroups: StudentGroup[];
  trackSources: TrackSource[];
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const router = useRouter();

  /** After a save the table has to show the new numbers, not the old ones. */
  function afterSave() {
    setDraft(null);
    router.refresh();
  }

  if (subjects.length === 0) {
    return (
      <div className="space-y-6">
        <Header yearLabel={yearLabel} onAdd={null} />
        <EmptyState
          icon={<ClipboardPen className="size-8" strokeWidth={1.5} />}
          title="ยังไม่มีวิชาเสริมที่เปิดใช้งาน"
          hint="เพิ่มวิชาในหน้า “วิชาเสริม” ก่อน จึงจะจัดนักเรียนเข้าเรียนได้"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header yearLabel={yearLabel} onAdd={() => setDraft({ mode: 'create' })} />

      <SectionOverview
        sections={sections}
        groups={groups}
        onEdit={(s) => setDraft({ mode: 'edit', section: s })}
        onDeleted={(id) => {
          setDraft((d) => (d?.mode === 'edit' && d.section.id === id ? null : d));
          router.refresh();
        }}
      />

      {/* The editor is a dialog, not a panel under the list: with a hundred
          กลุ่ม on the page, opening it inline scrolled the screen a page and a
          half away from the button that was just pressed. */}
      {draft ? (
        <SectionEditor
          key={draft.mode === 'edit' ? `s${draft.section.id}` : 'new'}
          draft={draft}
          groups={groups}
          subjects={subjects}
          sections={sections}
          students={students}
          studentGroups={studentGroups}
          trackSources={trackSources}
          onDone={afterSave}
          onCancel={() => setDraft(null)}
        />
      ) : null}
    </div>
  );
}

function Header({ yearLabel, onAdd }: { yearLabel: string; onAdd: (() => void) | null }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">จัดนักเรียนเข้าวิชา</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          วิชาเดียวกันเปิดได้หลายกลุ่ม · {yearLabel} — แต่ละกลุ่มมีวันเรียน ห้อง และนักเรียนของตัวเอง
        </p>
      </div>
      {onAdd ? (
        <Button onClick={onAdd}>
          <Plus className="size-4.5" strokeWidth={1.8} />
          เพิ่มกลุ่มเรียน
        </Button>
      ) : null}
    </div>
  );
}

/** One วิชา and every กลุ่ม opened for it — a folded line in the overview. */
interface SubjectBucket {
  subjectId: number;
  subjectCode: string;
  subjectName: string;
  teacherName: string | null;
  groupCode: string;
  rows: RegisterSection[];
  students: number;
  /** กลุ่ม already checked in on at least one day */
  checked: number;
  /** กลุ่ม still missing วันเรียน or นักเรียน */
  incomplete: number;
}

/**
 * Every รอบเรียน set up so far, folded under its วิชา. A วิชา is taught more
 * than once — to a different ชั้น, on different days — so the row is the
 * running, not the subject, and several rows share a subject code.
 *
 * Flat, that is sixty-nine rows today and past a hundred next year: the list was
 * scrolled, not read. Folded, it is one line per วิชา — the way this screen is
 * used, which is to open a วิชา and look at its กลุ่ม — and a line carries the
 * counts that say whether opening it is worth the click.
 *
 * Filters are หมวด, ชั้น and วันเรียน because those are the questions actually
 * asked of this list: "what is in ET?", "what does ม.4 have?", "what runs on the
 * 12th?".
 */
function SectionOverview({
  sections,
  groups,
  onEdit,
  onDeleted,
}: {
  sections: RegisterSection[];
  groups: RegisterGroup[];
  onEdit: (s: RegisterSection) => void;
  onDeleted: (sectionId: number) => void;
}) {
  const [groupId, setGroupId] = useState<number | 'all'>('all');
  const [grade, setGrade] = useState<string>('all');
  const [date, setDate] = useState<string>('all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const dialog = useDialog();

  const allDates = useMemo(
    () => [...new Set(sections.flatMap((s) => s.classDates))].sort(),
    [sections],
  );
  const allGrades = useMemo(
    () => sortGrades(sections.map((s) => gradeInLabel(s.name))),
    [sections],
  );

  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => {
    return sections.filter((s) => {
      if (groupId !== 'all' && s.groupId !== groupId) return false;
      if (grade !== 'all' && gradeInLabel(s.name) !== grade) return false;
      if (date !== 'all' && !s.classDates.includes(date)) return false;
      if (!needle) return true;
      return (
        s.subjectCode.toLowerCase().includes(needle) ||
        s.subjectName.toLowerCase().includes(needle) ||
        s.name.toLowerCase().includes(needle) ||
        (s.room ?? '').toLowerCase().includes(needle) ||
        (s.teacherName ?? '').toLowerCase().includes(needle)
      );
    });
  }, [sections, groupId, grade, date, needle]);

  // One bucket per วิชา, its กลุ่ม in ชั้น order — "กลุ่มเรียนที่ 10" after
  // "ที่ 9", which no SQL collation gets right, so it is ordered here.
  const buckets = useMemo(() => {
    const by = new Map<number, SubjectBucket>();
    for (const s of shown) {
      let b = by.get(s.subjectId);
      if (!b) {
        b = {
          subjectId: s.subjectId,
          subjectCode: s.subjectCode,
          subjectName: s.subjectName,
          teacherName: s.teacherName,
          groupCode: s.groupCode,
          rows: [],
          students: 0,
          checked: 0,
          incomplete: 0,
        };
        by.set(s.subjectId, b);
      }
      b.rows.push(s);
      b.students += s.studentCount;
      if (s.checkedDays > 0) b.checked += 1;
      if (s.classDates.length === 0 || s.studentCount === 0) b.incomplete += 1;
    }
    const list = [...by.values()];
    for (const b of list) b.rows.sort((x, y) => compareClassLabels(x.name, y.name));
    return list.sort(
      (a, b) =>
        a.groupCode.localeCompare(b.groupCode, 'th', { numeric: true }) ||
        a.subjectCode.localeCompare(b.subjectCode, 'th', { numeric: true }),
    );
  }, [shown]);

  // A search is a request to see the กลุ่ม that matched, not the วิชา they sit
  // under, so typing opens exactly those and clearing folds them back — while a
  // click on a line still opens or closes it as usual. Adjusted here rather than
  // in an effect so the list never paints folded for a frame first.
  const [lastNeedle, setLastNeedle] = useState('');
  if (needle !== lastNeedle) {
    setLastNeedle(needle);
    setOpen(needle ? new Set(buckets.map((b) => b.subjectId)) : new Set());
  }

  const allOpen = buckets.length > 0 && buckets.every((b) => open.has(b.subjectId));

  function toggle(subjectId: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(subjectId) ? next.delete(subjectId) : next.add(subjectId);
      return next;
    });
  }

  async function remove(s: RegisterSection) {
    if (busy) return;
    const ok = await dialog.confirm({
      title: `ลบกลุ่ม “${s.name}” ของวิชา ${s.subjectCode}?`,
      description: 'วันเรียนและรายชื่อนักเรียนของกลุ่มนี้จะถูกลบ — ตัววิชายังอยู่ เปิดกลุ่มใหม่ได้',
      detail: [
        `วันเรียน ${s.classDates.length} วัน`,
        `นักเรียน ${s.studentCount} คน`,
        ...(s.checkedDays > 0 ? [`เช็คชื่อไปแล้ว ${s.checkedDays} วัน — จะลบไม่ได้`] : []),
      ],
      tone: 'destructive',
      confirmLabel: 'ลบกลุ่มเรียน',
    });
    if (!ok) return;
    setBusy(s.id);
    const r = await deleteSection(s.id);
    setBusy(null);
    if (r.ok) {
      onDeleted(s.id);
      toast.success(r.message);
    } else {
      toast.error(r.message);
    }
  }

  return (
    <Card>
      {/* Search and filters stay put under the app bar: with a hundred กลุ่ม on
          the page, a filter that scrolls away is one the admin has to scroll
          back up to change. */}
      <div className="sticky top-16 z-20 rounded-t-2xl border-b border-border/60 bg-card/95 backdrop-blur">
        <CardHeader
          icon={<TableProperties className="size-4.5" strokeWidth={1.8} />}
          title="กลุ่มเรียนที่จัดไว้แล้ว"
          action={
            <Badge tone="secondary">
              {shown.length === sections.length
                ? `${buckets.length} วิชา · ${sections.length} กลุ่ม`
                : `${buckets.length} วิชา · ${shown.length}/${sections.length} กลุ่ม`}
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
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="h-10 w-28"
            disabled={allGrades.length === 0}
          >
            <option value="all">ทุกชั้น</option>
            {allGrades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
          <Select
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-10 w-44"
            disabled={allDates.length === 0}
          >
            <option value="all">ทุกวันเรียน</option>
            {allDates.map((d) => (
              <option key={d} value={d}>
                {THAI_WEEKDAYS_SHORT[weekdayOfYmd(d)]} {thaiDateLong(d)}
              </option>
            ))}
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-10"
            onClick={() => setOpen(allOpen ? new Set() : new Set(buckets.map((b) => b.subjectId)))}
            disabled={buckets.length === 0}
          >
            {allOpen ? (
              <ChevronsDownUp className="size-4" strokeWidth={1.9} />
            ) : (
              <ChevronsUpDown className="size-4" strokeWidth={1.9} />
            )}
            {allOpen ? 'ย่อทั้งหมด' : 'ขยายทั้งหมด'}
          </Button>
        </div>
      </div>

      {sections.length === 0 ? (
        <div className="p-4 sm:p-5">
          <EmptyState
            icon={<ClipboardPen className="size-8" strokeWidth={1.5} />}
            title="ยังไม่มีกลุ่มเรียน"
            hint="กด “เพิ่มกลุ่มเรียน” เพื่อเลือกวิชา กำหนดวันเรียน และเลือกนักเรียนเข้าเรียน"
          />
        </div>
      ) : buckets.length === 0 ? (
        <div className="p-4 sm:p-5">
          <EmptyState
            title="ไม่พบกลุ่มเรียนตามเงื่อนไข"
            hint="ลองล้างคำค้น หรือตัวกรองหมวด ชั้น และวันเรียน"
          />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {buckets.map((b) => (
            <SubjectRow
              key={b.subjectId}
              bucket={b}
              open={open.has(b.subjectId)}
              busy={busy}
              onToggle={() => toggle(b.subjectId)}
              onEdit={onEdit}
              onRemove={remove}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

/** One folded วิชา: the summary line, and its กลุ่ม when it is open. */
function SubjectRow({
  bucket,
  open,
  busy,
  onToggle,
  onEdit,
  onRemove,
}: {
  bucket: SubjectBucket;
  open: boolean;
  busy: number | null;
  onToggle: () => void;
  onEdit: (s: RegisterSection) => void;
  onRemove: (s: RegisterSection) => void;
}) {
  const total = bucket.rows.length;
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          'flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left text-sm transition-colors hover:bg-secondary/40 sm:px-5',
          open && 'bg-secondary/30',
        )}
      >
        <ChevronRight
          className={cn(
            'size-4.5 shrink-0 text-muted-foreground transition-transform duration-150',
            open && 'rotate-90',
          )}
          strokeWidth={2}
        />
        <Badge tone="primary" className="shrink-0">
          {bucket.groupCode}
        </Badge>
        <span className="shrink-0 font-medium">{bucket.subjectCode}</span>
        <span className="min-w-0 flex-1 truncate">
          {bucket.subjectName}
          {bucket.teacherName ? (
            <span className="text-muted-foreground"> · ครู {bucket.teacherName}</span>
          ) : null}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {total} กลุ่ม · {bucket.students} คน
        </span>
        {bucket.incomplete > 0 ? (
          <Badge tone="secondary" className="shrink-0">
            ยังไม่ครบ {bucket.incomplete} กลุ่ม
          </Badge>
        ) : bucket.checked > 0 ? (
          <Badge tone="success" className="shrink-0">
            เช็คแล้ว {bucket.checked}/{total} กลุ่ม
          </Badge>
        ) : (
          <Badge tone="navy" className="shrink-0">
            พร้อมเช็คชื่อ
          </Badge>
        )}
      </button>

      {open ? (
        <ul className="border-t border-border/60 bg-secondary/10">
          {bucket.rows.map((s) => (
            <SectionRow
              key={s.id}
              section={s}
              busy={busy === s.id}
              onEdit={() => onEdit(s)}
              onRemove={() => onRemove(s)}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** One กลุ่ม under its วิชา — ชั้น, ห้อง, วันเรียน, headcount and state. */
function SectionRow({
  section: s,
  busy,
  onEdit,
  onRemove,
}: {
  section: RegisterSection;
  busy: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const ready = s.classDates.length > 0 && s.studentCount > 0;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/40 px-4 py-2 last:border-b-0 hover:bg-secondary/40 sm:pl-12 sm:pr-5">
      <Badge tone="navy" className="shrink-0">
        {s.name}
      </Badge>
      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        <MapPin className="size-3.5" strokeWidth={1.8} />
        {s.room ?? 'ยังไม่ระบุห้อง'}
      </span>
      {s.classDates.length === 0 ? (
        <span className="text-xs text-muted-foreground">ยังไม่กำหนดวันเรียน</span>
      ) : (
        <div className="flex min-w-0 flex-wrap gap-1">
          {s.classDates.map((d) => (
            <span
              key={d}
              className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground"
            >
              {thaiDateShort(d)}
            </span>
          ))}
        </div>
      )}

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
          <Users className="size-3.5" strokeWidth={1.8} />
          {s.studentCount} คน
        </span>
        {s.checkedDays > 0 ? (
          <Badge tone="success">เช็คแล้ว {s.checkedDays} วัน</Badge>
        ) : ready ? (
          <Badge tone="navy">พร้อมเช็คชื่อ</Badge>
        ) : (
          <Badge tone="secondary">ยังไม่ครบ</Badge>
        )}
        <button
          onClick={onEdit}
          title="แก้ไขกลุ่มนี้"
          className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
        >
          <Pencil className="size-4.5" strokeWidth={1.8} />
        </button>
        <button
          onClick={onRemove}
          disabled={busy}
          title={s.checkedDays > 0 ? 'เช็คชื่อไปแล้ว — ต้องลบข้อมูลเช็คชื่อก่อน' : 'ลบกลุ่มนี้'}
          className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
        >
          <Trash2 className="size-4.5" strokeWidth={1.8} />
        </button>
      </div>
    </li>
  );
}

/**
 * The whole รอบเรียน in one dialog with one save button: which วิชา, what the
 * รอบ is called, where it meets, which days, and who is in it. Nothing is
 * written until บันทึก, so a half-filled form leaves no trace.
 *
 * A dialog rather than a panel below the list — the list is long enough that an
 * inline editor opened off the bottom of the screen — and one that a click
 * outside cannot close: a calendar and forty ticks are too much work to lose to
 * a stray click. Esc and ✕ ask first when there is something to lose.
 */
function SectionEditor({
  draft,
  groups,
  subjects,
  sections,
  students,
  studentGroups,
  trackSources,
  onDone,
  onCancel,
}: {
  draft: Draft;
  groups: RegisterGroup[];
  subjects: RegisterSubject[];
  sections: RegisterSection[];
  students: PickStudent[];
  studentGroups: StudentGroup[];
  trackSources: TrackSource[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const existing = draft.mode === 'edit' ? draft.section : null;

  const [groupId, setGroupId] = useState<number>(existing?.groupId ?? groups[0]?.id ?? 0);
  const [subjectId, setSubjectId] = useState<number | null>(existing?.subjectId ?? null);
  const [name, setName] = useState(existing?.name ?? '');
  const [room, setRoom] = useState(existing?.room ?? '');
  const [dates, setDates] = useState<string[]>(existing?.classDates ?? []);
  const [selected, setSelected] = useState<Set<number>>(new Set(existing?.memberIds ?? []));
  const [saving, setSaving] = useState(false);
  const [naming, setNaming] = useState(false);
  const dialog = useDialog();

  const inGroup = useMemo(() => subjects.filter((s) => s.groupId === groupId), [subjects, groupId]);
  const subject = useMemo(
    () => subjects.find((s) => s.id === subjectId) ?? null,
    [subjects, subjectId],
  );

  // Other รอบ of the same วิชา — the thing that was invisible before, and the
  // reason a second setup looked like it had overwritten the first.
  const siblings = useMemo(
    () => sections.filter((s) => s.subjectId === subjectId && s.id !== existing?.id),
    [sections, subjectId, existing],
  );

  // The กลุ่มเรียนพิเศษ the ticked roster exactly matches, if any — the same
  // rule the server names an unnamed กลุ่ม by, shown live so the label is never
  // a surprise.
  const matchedGroup = useMemo(
    () =>
      studentGroups.find(
        (g) =>
          g.memberIds.length > 0 &&
          g.memberIds.length === selected.size &&
          g.memberIds.every((id) => selected.has(id)),
      ) ?? null,
    [studentGroups, selected],
  );

  // The สาย the ticked roster is exactly, if any — read the same way as
  // matchedGroup, so a กลุ่ม pulled straight off a Track chip gets named after
  // the สาย instead of after its first วันเรียน.
  const matchedTrack = useMemo(
    () =>
      trackSources.find(
        (t) =>
          t.memberIds.length > 0 &&
          t.memberIds.length === selected.size &&
          t.memberIds.every((id) => selected.has(id)),
      ) ?? null,
    [trackSources, selected],
  );

  /** What the server will call this กลุ่ม if the name is left blank. */
  const autoLabel = useMemo(() => {
    if (matchedGroup) return matchedGroup.name;
    if (matchedTrack) return trackSourceLabel(matchedTrack);
    if (dates.length === 1) return thaiDateShort(dates[0]);
    if (dates.length > 1) return `${thaiDateShort(dates[0])} +${dates.length - 1}`;
    return 'กลุ่มที่ 1';
  }, [matchedGroup, matchedTrack, dates]);

  /** Is there anything in here that บันทึก has not been pressed on yet? */
  const dirty =
    subjectId !== (existing?.subjectId ?? null) ||
    name !== (existing?.name ?? '') ||
    room !== (existing?.room ?? '') ||
    dates.join(',') !== (existing?.classDates ?? []).join(',') ||
    selected.size !== (existing?.memberIds.length ?? 0) ||
    !(existing?.memberIds ?? []).every((id) => selected.has(id));

  /** Esc, ✕ and ยกเลิก all come through here — and stop to ask when it matters. */
  async function requestClose() {
    // The Esc that closes สร้างกลุ่มเรียนพิเศษ on top must not close this too.
    if (saving || naming) return;
    if (dirty) {
      const ok = await dialog.confirm({
        title: 'ปิดโดยไม่บันทึก?',
        description: 'วันเรียนและรายชื่อที่เลือกไว้ยังไม่ได้บันทึก — ปิดแล้วจะหายไปทั้งหมด',
        tone: 'destructive',
        confirmLabel: 'ปิดโดยไม่บันทึก',
        cancelLabel: 'กลับไปแก้ต่อ',
      });
      if (!ok) return;
    }
    onCancel();
  }

  function toggleDate(d: string) {
    setDates((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }
  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function bulk(ids: number[], select: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) select ? next.add(id) : next.delete(id);
      return next;
    });
  }

  async function submit() {
    if (saving) return;
    if (!subjectId) {
      toast.error('เลือกวิชาก่อน');
      return;
    }
    setSaving(true);
    const r = await saveSection({
      sectionId: existing?.id ?? null,
      subjectId,
      name,
      room,
      dates,
      studentIds: [...selected],
    });
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
      onClose={requestClose}
      closeOnBackdrop={false}
      labelledBy="section-editor-title"
      className="max-w-5xl"
      footer={
        <>
          {subject && !room.trim() ? (
            <p className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3.5" strokeWidth={1.8} />
              ยังไม่ได้ระบุห้อง — ครูจะไม่เห็นห้องตอนเช็คชื่อ
            </p>
          ) : null}
          <Button variant="outline" onClick={requestClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button onClick={submit} disabled={saving} className="min-w-44">
            {saving ? (
              <Loader2 className="size-4.5 animate-spin" />
            ) : (
              <Save className="size-4.5" strokeWidth={1.8} />
            )}
            บันทึกกลุ่มเรียน
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <ClipboardPen className="size-4.5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h2 id="section-editor-title" className="text-base font-semibold">
              {existing ? `แก้ไขกลุ่ม “${existing.name}”` : 'เพิ่มกลุ่มเรียน'}
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              {existing
                ? `${existing.subjectCode} ${existing.subjectName}`
                : 'เลือกวิชา กำหนดวันเรียน แล้วเลือกนักเรียน — บันทึกครั้งเดียวครบทั้งกลุ่ม'}
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="r-group">หมวด</Label>
            <Select
              id="r-group"
              value={groupId}
              onChange={(e) => {
                setGroupId(Number(e.target.value));
                setSubjectId(null);
              }}
              disabled={!!existing}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.code} · {g.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="r-subject">วิชา</Label>
            <Select
              id="r-subject"
              value={subjectId ?? ''}
              onChange={(e) => setSubjectId(e.target.value ? Number(e.target.value) : null)}
              disabled={!!existing || inGroup.length === 0}
            >
              <option value="">
                {inGroup.length === 0 ? '— หมวดนี้ยังไม่มีวิชา —' : '— เลือกวิชา —'}
              </option>
              {inGroup.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="r-room">ห้องที่เรียน</Label>
            <Input
              id="r-room"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="เช่น อาคาร 3 ห้อง 312"
            />
          </div>
          <div>
            <Label htmlFor="r-name">
              ชื่อกลุ่ม <span className="font-normal text-muted-foreground">(ไม่บังคับ)</span>
            </Label>
            <Input
              id="r-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`เว้นว่างได้ — จะใช้ “${autoLabel}”`}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {matchedGroup
                ? `ตรงกับกลุ่มเรียนพิเศษ “${matchedGroup.name}” — จะใช้ชื่อนี้ให้`
                : 'เว้นว่างไว้ ระบบจะตั้งจากกลุ่มเรียนพิเศษที่เลือก หรือจากวันเรียน'}
            </p>
          </div>
        </div>

        {subject && siblings.length > 0 ? (
          <div className="rounded-xl border border-border bg-secondary/30 p-3.5 text-xs">
            <p className="font-medium">
              วิชา {subject.code} มีกลุ่มอื่นอยู่แล้ว {siblings.length} กลุ่ม — กลุ่มนี้เก็บแยก
              ไม่ทับกัน
            </p>
            <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
              {siblings.map((s) => (
                <li key={s.id}>
                  {s.name} · {s.room ?? 'ยังไม่ระบุห้อง'} · {s.studentCount} คน ·{' '}
                  {s.classDates.length > 0
                    ? s.classDates.map((d) => thaiDateShort(d)).join(', ')
                    : 'ยังไม่กำหนดวัน'}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[340px_1fr]">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                <CalendarDays className="size-4.5 text-muted-foreground" strokeWidth={1.8} />
                วันเรียน
              </span>
              {dates.length ? <Badge tone="primary">{dates.length} วัน</Badge> : null}
            </div>
            <p className="mb-2 text-xs text-muted-foreground">
              กดวันที่ในปฏิทินเพื่อเลือก — เลือกได้ตั้งแต่วันเดียวจนถึงหลายวัน กดซ้ำเพื่อเอาออก
            </p>
            <ThaiCalendar selected={dates} onToggle={toggleDate} />
            <div className="mt-3">
              <SelectedDates dates={dates} onRemove={toggleDate} />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Users className="size-4.5 text-muted-foreground" strokeWidth={1.8} />
                นักเรียนในกลุ่มนี้
              </span>
              <Badge tone="navy">{selected.size} คน</Badge>
            </div>

            <GroupPicker
              groups={studentGroups}
              selected={selected}
              onBulk={bulk}
              onSaveAsGroup={() => setNaming(true)}
            />

            {trackSources.length ? (
              <div className="mt-3">
                <TrackPicker sources={trackSources} selected={selected} onBulk={bulk} />
              </div>
            ) : null}

            <div className="mt-3">
              <StudentPicker
                students={students}
                selected={selected}
                onToggle={toggle}
                onBulk={bulk}
                height="h-[20rem]"
              />
            </div>
          </div>
        </div>

        <p className="border-t border-border/60 pt-4 text-xs text-muted-foreground">
          บันทึกครั้งเดียวครบทั้งวันเรียน ห้อง และรายชื่อนักเรียน ·
          การนำนักเรียนออกเก็บเป็นประวัติ ไม่ลบทิ้ง
        </p>
      </div>

      {naming ? <NewGroupModal studentIds={[...selected]} onClose={() => setNaming(false)} /> : null}
    </Modal>
  );
}

/** "TrackSM · กฎหมาย" — what a สาย or one of its แขนง is called on a chip. */
export function trackSourceLabel(t: TrackSource): string {
  return t.optionName ? `${t.trackName} · ${t.optionName}` : t.trackName;
}

/**
 * ดึงรายชื่อจาก Track — the นักเรียน of one สายการเรียน, dropped into the
 * roster in one press.
 *
 * The whole point of the screen above this one is that นักเรียน choose their
 * own สาย; re-ticking those same forty names by hand here is work the school
 * has already done. Additive like the กลุ่มเรียนพิเศษ chips, and pressing a
 * chip whose people are all already ticked takes them out again — so a wrong
 * chip costs one more press, not a rebuilt list.
 */
function TrackPicker({
  sources,
  selected,
  onBulk,
}: {
  sources: TrackSource[];
  selected: Set<number>;
  onBulk: (ids: number[], select: boolean) => void;
}) {
  const semesters = useMemo(
    () => [...new Set(sources.map((s) => s.semester))].sort((a, b) => a - b),
    [sources],
  );
  // Opens on the latest ภาคเรียน that has anybody in it — the term being set
  // up is almost always the newest one, and the label says which either way.
  const [semester, setSemester] = useState(() => semesters[semesters.length - 1] ?? 1);
  const shown = sources.filter((s) => s.semester === semester);

  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Route className="size-4.5 text-muted-foreground" strokeWidth={1.8} />
          ดึงรายชื่อจาก Track
        </div>
        {semesters.length > 1 ? (
          <Select
            value={semester}
            onChange={(e) => setSemester(Number(e.target.value))}
            className="h-9 w-36"
            aria-label="ภาคเรียนของ Track"
          >
            {semesters.map((s) => (
              <option key={s} value={s}>
                ภาคเรียนที่ {s}
              </option>
            ))}
          </Select>
        ) : (
          <Badge tone="secondary">ภาคเรียนที่ {semester}</Badge>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          ยังไม่มีนักเรียนเลือก Track ในภาคเรียนที่ {semester}
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {shown.map((t) => {
            const all = t.memberIds.every((id) => selected.has(id));
            return (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => onBulk(t.memberIds, !all)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                    all
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card hover:bg-secondary/60',
                  )}
                >
                  {trackSourceLabel(t)}
                  <span
                    className={cn(
                      'tabular-nums',
                      all ? 'text-primary-foreground/70' : 'text-muted-foreground',
                    )}
                  >
                    {t.memberIds.length}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * The three ways a teacher builds the class list: drop in a saved
 * กลุ่มเรียนพิเศษ, save the current ticks as a new one, or just tick people off
 * the list below. Adding a group is additive — it never clears existing ticks,
 * so two groups can be combined.
 */
function GroupPicker({
  groups,
  selected,
  onBulk,
  onSaveAsGroup,
}: {
  groups: StudentGroup[];
  selected: Set<number>;
  onBulk: (ids: number[], select: boolean) => void;
  onSaveAsGroup: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <UsersRound className="size-4.5 text-muted-foreground" strokeWidth={1.8} />
          เลือกจากกลุ่มเรียนพิเศษ
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onSaveAsGroup}
          disabled={selected.size === 0}
        >
          <Plus className="size-4" strokeWidth={1.9} />
          สร้างกลุ่มจากที่เลือก
        </Button>
      </div>

      {groups.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          ยังไม่มีกลุ่มเรียนพิเศษ — ติ๊กเลือกนักเรียนด้านล่างแล้วกด “สร้างกลุ่มจากที่เลือก”
          เพื่อใช้ซ้ำกับกลุ่มอื่น
        </p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {groups.map((g) => {
            const all = g.memberIds.length > 0 && g.memberIds.every((id) => selected.has(id));
            return (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => onBulk(g.memberIds, !all)}
                  disabled={g.memberIds.length === 0}
                  title={g.note ?? undefined}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                    all
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card hover:bg-secondary/60',
                  )}
                >
                  {g.name}
                  <span
                    className={cn(
                      'tabular-nums',
                      all ? 'text-primary-foreground/70' : 'text-muted-foreground',
                    )}
                  >
                    {g.memberIds.length}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function NewGroupModal({ studentIds, onClose }: { studentIds: number[]; onClose: () => void }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function submit() {
    if (saving) return;
    setSaving(true);
    const r = await createGroupFromSelection({ name, studentIds });
    setSaving(false);
    if (r.ok) {
      toast.success(r.message);
      router.refresh();
      onClose();
    } else {
      toast.error(r.message);
    }
  }

  return (
    <Modal
      onClose={onClose}
      labelledBy="new-group-title"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button onClick={submit} disabled={saving || !name.trim()}>
            สร้างกลุ่ม
          </Button>
        </>
      }
    >
      <h2 id="new-group-title" className="text-base font-semibold">
        สร้างกลุ่มเรียนพิเศษ
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        บันทึกนักเรียน {studentIds.length} คนที่เลือกไว้เป็นกลุ่ม ใช้ซ้ำกับกลุ่มอื่นได้ทันที
      </p>
      <div className="mt-4">
        <Label htmlFor="ng-name">ชื่อกลุ่ม</Label>
        <Input
          id="ng-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="เช่น กลุ่มโครงงาน ม.5"
          autoFocus
        />
      </div>
    </Modal>
  );
}
