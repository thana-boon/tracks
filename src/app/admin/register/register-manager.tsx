'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ClipboardPen,
  CalendarDays,
  Save,
  Search,
  Users,
  UsersRound,
  Plus,
  Pencil,
  Trash2,
  TableProperties,
  MapPin,
  X,
  Loader2,
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

/** What the editor is working on: a brand-new รอบ, or an existing one. */
type Draft = { mode: 'create' } | { mode: 'edit'; section: RegisterSection };

export function RegisterManager({
  yearLabel,
  groups,
  subjects,
  sections,
  students,
  studentGroups,
}: {
  yearLabel: string;
  groups: RegisterGroup[];
  subjects: RegisterSubject[];
  sections: RegisterSection[];
  students: PickStudent[];
  studentGroups: StudentGroup[];
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  function open(next: Draft) {
    setDraft(next);
    requestAnimationFrame(() =>
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }

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
      <Header yearLabel={yearLabel} onAdd={() => open({ mode: 'create' })} />

      <SectionOverview
        sections={sections}
        groups={groups}
        onEdit={(s) => open({ mode: 'edit', section: s })}
        onDeleted={(id) => {
          setDraft((d) => (d?.mode === 'edit' && d.section.id === id ? null : d));
          router.refresh();
        }}
      />

      <div ref={editorRef} className="scroll-mt-4">
        {draft ? (
          <SectionEditor
            key={draft.mode === 'edit' ? `s${draft.section.id}` : 'new'}
            draft={draft}
            groups={groups}
            subjects={subjects}
            sections={sections}
            students={students}
            studentGroups={studentGroups}
            onDone={afterSave}
            onCancel={() => setDraft(null)}
          />
        ) : null}
      </div>
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

/**
 * Every รอบเรียน set up so far, in one table. A วิชา is taught more than once —
 * to a different กลุ่ม, on different days — so the row is the running, not the
 * subject, and two rows can share a subject code.
 *
 * Filters are หมวด and วันเรียน because those are the two questions actually
 * asked of this list: "what is in ET?" and "what runs on the 12th?".
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
  const [date, setDate] = useState<string>('all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const dialog = useDialog();

  const allDates = useMemo(
    () => [...new Set(sections.flatMap((s) => s.classDates))].sort(),
    [sections],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sections.filter((s) => {
      if (groupId !== 'all' && s.groupId !== groupId) return false;
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
  }, [sections, groupId, date, q]);

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
      <CardHeader
        icon={<TableProperties className="size-4.5" strokeWidth={1.8} />}
        title="กลุ่มเรียนที่จัดไว้แล้ว"
        action={
          <Badge tone="secondary">
            {shown.length === sections.length
              ? `${sections.length} กลุ่ม`
              : `${shown.length}/${sections.length} กลุ่ม`}
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
          className="h-10 w-44"
        >
          <option value="all">ทุกหมวด</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.code} · {g.name}
            </option>
          ))}
        </Select>
        <Select
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-10 w-48"
          disabled={allDates.length === 0}
        >
          <option value="all">ทุกวันเรียน</option>
          {allDates.map((d) => (
            <option key={d} value={d}>
              {THAI_WEEKDAYS_SHORT[weekdayOfYmd(d)]} {thaiDateLong(d)}
            </option>
          ))}
        </Select>
      </div>

      {sections.length === 0 ? (
        <div className="px-4 pb-5 sm:px-5">
          <EmptyState
            icon={<ClipboardPen className="size-8" strokeWidth={1.5} />}
            title="ยังไม่มีกลุ่มเรียน"
            hint="กด “เพิ่มกลุ่มเรียน” เพื่อเลือกวิชา กำหนดวันเรียน และเลือกนักเรียนเข้าเรียน"
          />
        </div>
      ) : shown.length === 0 ? (
        <div className="px-4 pb-5 sm:px-5">
          <EmptyState title="ไม่พบกลุ่มเรียนตามเงื่อนไข" hint="ลองล้างตัวกรองหมวดหรือวันเรียน" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-y border-border text-xs text-muted-foreground">
                <th className="px-4 py-2.5 text-left font-medium">วิชา / กลุ่ม</th>
                <th className="px-3 py-2.5 text-left font-medium">ห้องเรียน</th>
                <th className="px-3 py-2.5 text-left font-medium">วันเรียน</th>
                <th className="px-3 py-2.5 text-center font-medium">นักเรียน</th>
                <th className="px-3 py-2.5 text-center font-medium">สถานะ</th>
                <th className="px-4 py-2.5 text-right font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {shown.map((s) => {
                const ready = s.classDates.length > 0 && s.studentCount > 0;
                return (
                  <tr key={s.id} className="hover:bg-secondary/40">
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="primary">{s.groupCode}</Badge>
                        <span className="font-medium">{s.subjectCode}</span>
                        <span className="truncate">{s.subjectName}</span>
                        <Badge tone="navy">{s.name}</Badge>
                      </div>
                      {s.teacherName ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">ครู {s.teacherName}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{s.room ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      {s.classDates.length === 0 ? (
                        <span className="text-xs text-muted-foreground">ยังไม่กำหนด</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
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
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums">
                      {s.studentCount || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {s.checkedDays > 0 ? (
                        <Badge tone="success">เช็คแล้ว {s.checkedDays} วัน</Badge>
                      ) : ready ? (
                        <Badge tone="navy">พร้อมเช็คชื่อ</Badge>
                      ) : (
                        <Badge tone="secondary">ยังไม่ครบ</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onEdit(s)}
                          title="แก้ไขกลุ่มนี้"
                          className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                        >
                          <Pencil className="size-4.5" strokeWidth={1.8} />
                        </button>
                        <button
                          onClick={() => remove(s)}
                          disabled={busy === s.id}
                          title={
                            s.checkedDays > 0
                              ? 'เช็คชื่อไปแล้ว — ต้องลบข้อมูลเช็คชื่อก่อน'
                              : 'ลบกลุ่มนี้'
                          }
                          className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
                        >
                          <Trash2 className="size-4.5" strokeWidth={1.8} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/**
 * The whole รอบเรียน on one screen with one save button: which วิชา, what the
 * รอบ is called, where it meets, which days, and who is in it. Nothing is
 * written until บันทึก, so a half-filled form leaves no trace.
 */
function SectionEditor({
  draft,
  groups,
  subjects,
  sections,
  students,
  studentGroups,
  onDone,
  onCancel,
}: {
  draft: Draft;
  groups: RegisterGroup[];
  subjects: RegisterSubject[];
  sections: RegisterSection[];
  students: PickStudent[];
  studentGroups: StudentGroup[];
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

  /** What the server will call this กลุ่ม if the name is left blank. */
  const autoLabel = useMemo(() => {
    if (matchedGroup) return matchedGroup.name;
    if (dates.length === 1) return thaiDateShort(dates[0]);
    if (dates.length > 1) return `${thaiDateShort(dates[0])} +${dates.length - 1}`;
    return 'กลุ่มที่ 1';
  }, [matchedGroup, dates]);

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
    <Card>
      <CardHeader
        icon={<ClipboardPen className="size-4.5" strokeWidth={1.8} />}
        title={existing ? `แก้ไขกลุ่ม “${existing.name}”` : 'เพิ่มกลุ่มเรียน'}
        action={
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            <X className="size-4" strokeWidth={1.9} />
            ยกเลิก
          </Button>
        }
      />

      <div className="space-y-5 px-4 pb-5 sm:px-5">
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

            <div className="mt-3">
              <StudentPicker
                students={students}
                selected={selected}
                onToggle={toggle}
                onBulk={bulk}
                height="h-[24rem]"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2 border-t border-border/60 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={submit} disabled={saving} className="min-w-56 flex-1 sm:flex-none">
              {saving ? (
                <Loader2 className="size-4.5 animate-spin" />
              ) : (
                <Save className="size-4.5" strokeWidth={1.8} />
              )}
              บันทึกกลุ่มเรียน
            </Button>
            <p className="text-xs text-muted-foreground">
              บันทึกครั้งเดียวครบทั้งวันเรียน ห้อง และรายชื่อนักเรียน ·
              การนำนักเรียนออกเก็บเป็นประวัติ ไม่ลบทิ้ง
            </p>
          </div>
          {subject && !room.trim() ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3.5" strokeWidth={1.8} />
              ยังไม่ได้ระบุห้อง — ครูจะไม่เห็นห้องตอนเช็คชื่อ
            </p>
          ) : null}
        </div>
      </div>

      {naming ? <NewGroupModal studentIds={[...selected]} onClose={() => setNaming(false)} /> : null}
    </Card>
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
