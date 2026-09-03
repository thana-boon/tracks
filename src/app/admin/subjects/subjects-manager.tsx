'use client';

import { useMemo, useState, useTransition } from 'react';
import { Plus, Pencil, Trash2, BookOpen, Power, User, Layers } from 'lucide-react';
import { toast } from 'sonner';
import {
  Card,
  CardHeader,
  Button,
  Input,
  Label,
  Select,
  Textarea,
  Badge,
  EmptyState,
} from '@/components/ui';
import { Modal, useDialog } from '@/components/dialog';
import { cn } from '@/lib/utils';
import { PHASE_SLOTS, phaseKey, phaseLabel } from '@/lib/subject-phase';
import { saveSubject, toggleSubject, deleteSubject, setSubjectPhase } from './actions';

export interface SubjectItem {
  id: number;
  code: string;
  name: string;
  teacherName: string | null;
  description: string | null;
  active: boolean;
  semester: number | null;
  phase: number | null;
  groupId: number;
  groupCode: string;
  groupName: string;
  studentCount: number;
}
export interface GroupOption {
  id: number;
  code: string;
  name: string;
}

/** ช่วงที่แท็บหนึ่งถูกแบ่ง — สี่ช่วงของปี แล้วตามด้วยวิชาที่ยังไม่ได้จัดเข้าช่วง */
const BUCKETS: { key: string; semester: number | null; phase: number | null; label: string }[] = [
  ...PHASE_SLOTS.map((s) => ({ ...s, label: phaseLabel(s.semester, s.phase) })),
  { key: 'none', semester: null, phase: null, label: phaseLabel(null, null) },
];

export function SubjectsManager({
  subjects,
  groups,
}: {
  subjects: SubjectItem[];
  groups: GroupOption[];
}) {
  const [editing, setEditing] = useState<SubjectItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<number | null>(groups[0]?.id ?? null);

  const groupId = tab != null && groups.some((g) => g.id === tab) ? tab : (groups[0]?.id ?? null);
  const inTab = useMemo(() => subjects.filter((s) => s.groupId === groupId), [subjects, groupId]);

  // Every ช่วง keeps its section even when empty: the page exists to show what
  // each ช่วง holds, and an empty one is an answer too. “ยังไม่ระบุช่วง” is the
  // exception — it shows only while something is still sitting in it.
  const sections = useMemo(
    () =>
      BUCKETS.map((b) => ({
        ...b,
        items: inTab.filter((s) => phaseKey(s.semester, s.phase) === b.key),
      })).filter((b) => b.key !== 'none' || b.items.length > 0),
    [inTab],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">วิชาเสริม</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            แยกตามกลุ่มวิชา และภายในกลุ่มแยกตามช่วงที่เปิดสอน
          </p>
        </div>
        <Button onClick={() => setCreating(true)} disabled={groups.length === 0}>
          <Plus className="size-4.5" strokeWidth={1.8} />
          เพิ่มวิชา
        </Button>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-8" strokeWidth={1.5} />}
          title="ยังไม่มีกลุ่มวิชา"
          hint="เพิ่มกลุ่มวิชาก่อนจึงจะเพิ่มวิชาได้"
          action={
            <a
              href="/admin/groups"
              className="mt-2 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              ไปที่กลุ่มวิชา
            </a>
          }
        />
      ) : (
        <>
          <div
            role="tablist"
            aria-label="กลุ่มวิชา"
            className="flex gap-1 overflow-x-auto border-b border-border"
          >
            {groups.map((g) => {
              const active = g.id === groupId;
              const n = subjects.filter((s) => s.groupId === g.id).length;
              return (
                <button
                  key={g.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(g.id)}
                  className={cn(
                    'flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors',
                    active
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                  )}
                >
                  <span className="font-bold">{g.code}</span>
                  <span className="hidden font-medium sm:inline">{g.name}</span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-medium',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'bg-secondary text-secondary-foreground',
                    )}
                  >
                    {n}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="space-y-5">
            {sections.map((b) => (
              <Card key={b.key}>
                <CardHeader
                  icon={<Layers className="size-4.5" strokeWidth={1.8} />}
                  title={b.label}
                  action={<Badge tone="primary">{b.items.length} วิชา</Badge>}
                />
                {b.items.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-muted-foreground sm:px-5">
                    ยังไม่มีวิชาในช่วงนี้
                  </p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {b.items.map((s) => (
                      <SubjectRow key={s.id} subject={s} onEdit={() => setEditing(s)} />
                    ))}
                  </ul>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      {creating ? (
        <SubjectForm groups={groups} defaultGroupId={groupId} onClose={() => setCreating(false)} />
      ) : null}
      {editing ? (
        <SubjectForm groups={groups} subject={editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

function SubjectRow({ subject: s, onEdit }: { subject: SubjectItem; onEdit: () => void }) {
  const dialog = useDialog();
  const [, start] = useTransition();

  async function remove() {
    const ok = await dialog.confirm({
      title: `ลบวิชา “${s.name}”?`,
      description: 'ลบได้เฉพาะวิชาที่ยังไม่เคยมีการจัดนักเรียน',
      tone: 'destructive',
    });
    if (!ok) return;
    const r = await deleteSubject(s.id);
    r.ok ? toast.success(r.message) : toast.error(r.message);
  }

  async function toggle() {
    const r = await toggleSubject(s.id, !s.active);
    r.ok ? toast.success(r.message) : toast.error(r.message);
    start(() => {});
  }

  async function move(value: string) {
    const [semester, phase] = value === 'none' ? [null, null] : value.split('-').map(Number);
    const r = await setSubjectPhase(s.id, semester, phase);
    r.ok ? toast.success(r.message) : toast.error(r.message);
    start(() => {});
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-xs font-bold text-secondary-foreground">
        {s.code}
      </span>
      <div className="min-w-40 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{s.name}</p>
          {!s.active ? <Badge tone="secondary">ปิดใช้งาน</Badge> : null}
          {s.studentCount > 0 ? <Badge tone="navy">{s.studentCount} คน</Badge> : null}
        </div>
        {s.teacherName ? (
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <User className="size-3.5" strokeWidth={1.8} /> {s.teacherName}
          </p>
        ) : null}
      </div>
      {/* ย้ายช่วงได้จากบรรทัดนี้เลย — วิชาที่สร้างไว้ก่อนหน้ายังไม่มีช่วง และต้องจัดเข้าที่ทีละหลายวิชา */}
      <Select
        aria-label={`ช่วงของวิชา ${s.name}`}
        value={phaseKey(s.semester, s.phase)}
        onChange={(e) => move(e.target.value)}
        className="h-9 w-48 text-xs"
      >
        {PHASE_SLOTS.map((p) => (
          <option key={p.key} value={p.key}>
            {phaseLabel(p.semester, p.phase)}
          </option>
        ))}
        <option value="none">{phaseLabel(null, null)}</option>
      </Select>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={toggle}
          title={s.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
          className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
        >
          <Power className="size-4.5" strokeWidth={1.8} />
        </button>
        <button
          onClick={onEdit}
          title="แก้ไข"
          className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
        >
          <Pencil className="size-4.5" strokeWidth={1.8} />
        </button>
        <button
          onClick={remove}
          title="ลบ"
          className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4.5" strokeWidth={1.8} />
        </button>
      </div>
    </li>
  );
}

function SubjectForm({
  subject,
  groups,
  defaultGroupId,
  onClose,
}: {
  subject?: SubjectItem;
  groups: GroupOption[];
  defaultGroupId?: number | null;
  onClose: () => void;
}) {
  const [groupId, setGroupId] = useState(subject?.groupId ?? defaultGroupId ?? groups[0]?.id ?? 0);
  const [slot, setSlot] = useState(phaseKey(subject?.semester ?? null, subject?.phase ?? null));
  const [code, setCode] = useState(subject?.code ?? '');
  const [name, setName] = useState(subject?.name ?? '');
  const [teacherName, setTeacherName] = useState(subject?.teacherName ?? '');
  const [description, setDescription] = useState(subject?.description ?? '');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (saving) return;
    setSaving(true);
    const [semester, phase] = slot === 'none' ? [null, null] : slot.split('-').map(Number);
    const r = await saveSubject(subject?.id ?? null, {
      groupId,
      code,
      name,
      teacherName,
      description,
      semester,
      phase,
    });
    setSaving(false);
    if (r.ok) {
      toast.success(r.message);
      onClose();
    } else {
      toast.error(r.message);
    }
  }

  return (
    <Modal
      onClose={onClose}
      labelledBy="subject-form-title"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button onClick={submit} disabled={saving}>
            บันทึก
          </Button>
        </>
      }
    >
      <h2 id="subject-form-title" className="text-base font-semibold">
        {subject ? 'แก้ไขวิชา' : 'เพิ่มวิชา'}
      </h2>
      <div className="mt-4 space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="s-group">กลุ่มวิชา</Label>
            <Select
              id="s-group"
              value={groupId}
              onChange={(e) => setGroupId(Number(e.target.value))}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.code} · {g.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="s-phase">ช่วงที่เปิดสอน</Label>
            <Select id="s-phase" value={slot} onChange={(e) => setSlot(e.target.value)}>
              {PHASE_SLOTS.map((p) => (
                <option key={p.key} value={p.key}>
                  {phaseLabel(p.semester, p.phase)}
                </option>
              ))}
              <option value="none">{phaseLabel(null, null)}</option>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="s-code">รหัสวิชา</Label>
            <Input
              id="s-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="เช่น ET101"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="s-teacher">ครูผู้สอน</Label>
            <Input
              id="s-teacher"
              value={teacherName}
              onChange={(e) => setTeacherName(e.target.value)}
              placeholder="ไม่บังคับ"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="s-name">ชื่อวิชา</Label>
          <Input
            id="s-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น การตัดต่อวิดีโอ"
          />
        </div>
        <div>
          <Label htmlFor="s-desc">คำอธิบาย (ไม่บังคับ)</Label>
          <Textarea
            id="s-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
