'use client';

import { useMemo, useState, useTransition } from 'react';
import { Plus, Pencil, Trash2, BookOpen, Power, User } from 'lucide-react';
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
import { saveSubject, toggleSubject, deleteSubject } from './actions';

export interface SubjectItem {
  id: number;
  code: string;
  name: string;
  teacherName: string | null;
  description: string | null;
  active: boolean;
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

export function SubjectsManager({
  subjects,
  groups,
}: {
  subjects: SubjectItem[];
  groups: GroupOption[];
}) {
  const [editing, setEditing] = useState<SubjectItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<number | 'all'>('all');
  const dialog = useDialog();
  const [, start] = useTransition();

  const shown = useMemo(
    () => (filter === 'all' ? subjects : subjects.filter((s) => s.groupId === filter)),
    [subjects, filter],
  );

  async function remove(s: SubjectItem) {
    const ok = await dialog.confirm({
      title: `ลบวิชา “${s.name}”?`,
      description: 'ลบได้เฉพาะวิชาที่ยังไม่เคยมีการจัดนักเรียน',
      tone: 'destructive',
    });
    if (!ok) return;
    const r = await deleteSubject(s.id);
    r.ok ? toast.success(r.message) : toast.error(r.message);
  }

  async function toggle(s: SubjectItem) {
    const r = await toggleSubject(s.id, !s.active);
    r.ok ? toast.success(r.message) : toast.error(r.message);
    start(() => {});
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">วิชาเสริม</h1>
          <p className="mt-1 text-sm text-muted-foreground">วิชาที่อยู่ในแต่ละกลุ่ม พร้อมชื่อครูผู้สอน</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(filter)}
            onChange={(e) => setFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="h-10 w-44"
          >
            <option value="all">ทุกกลุ่ม</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.code} · {g.name}
              </option>
            ))}
          </Select>
          <Button onClick={() => setCreating(true)} disabled={groups.length === 0}>
            <Plus className="size-4.5" strokeWidth={1.8} />
            เพิ่มวิชา
          </Button>
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-8" strokeWidth={1.5} />}
          title="ยังไม่มีกลุ่มวิชา"
          hint="เพิ่มกลุ่มวิชาก่อนจึงจะเพิ่มวิชาได้"
          action={
            <a href="/admin/groups" className="mt-2 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              ไปที่กลุ่มวิชา
            </a>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-8" strokeWidth={1.5} />}
          title="ยังไม่มีวิชาในมุมมองนี้"
          hint="กดปุ่ม “เพิ่มวิชา” เพื่อสร้างวิชาแรก"
        />
      ) : (
        <Card>
          <CardHeader icon={<BookOpen className="size-4.5" strokeWidth={1.8} />} title={`ทั้งหมด ${shown.length} วิชา`} />
          <ul className="divide-y divide-border/60">
            {shown.map((s) => (
              <li key={s.id} className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-xs font-bold text-secondary-foreground">
                  {s.code}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{s.name}</p>
                    {!s.active ? <Badge tone="secondary">ปิดใช้งาน</Badge> : null}
                    <Badge tone="primary">{s.groupCode}</Badge>
                    {s.studentCount > 0 ? <Badge tone="navy">{s.studentCount} คน</Badge> : null}
                  </div>
                  {s.teacherName ? (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <User className="size-3.5" strokeWidth={1.8} /> {s.teacherName}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => toggle(s)} title={s.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'} className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary/60 hover:text-foreground">
                    <Power className="size-4.5" strokeWidth={1.8} />
                  </button>
                  <button onClick={() => setEditing(s)} title="แก้ไข" className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary/60 hover:text-foreground">
                    <Pencil className="size-4.5" strokeWidth={1.8} />
                  </button>
                  <button onClick={() => remove(s)} title="ลบ" className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="size-4.5" strokeWidth={1.8} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {creating ? <SubjectForm groups={groups} onClose={() => setCreating(false)} /> : null}
      {editing ? <SubjectForm groups={groups} subject={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function SubjectForm({
  subject,
  groups,
  onClose,
}: {
  subject?: SubjectItem;
  groups: GroupOption[];
  onClose: () => void;
}) {
  const [groupId, setGroupId] = useState(subject?.groupId ?? groups[0]?.id ?? 0);
  const [code, setCode] = useState(subject?.code ?? '');
  const [name, setName] = useState(subject?.name ?? '');
  const [teacherName, setTeacherName] = useState(subject?.teacherName ?? '');
  const [description, setDescription] = useState(subject?.description ?? '');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (saving) return;
    setSaving(true);
    const r = await saveSubject(subject?.id ?? null, { groupId, code, name, teacherName, description });
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
        <div>
          <Label htmlFor="s-group">กลุ่มวิชา</Label>
          <Select id="s-group" value={groupId} onChange={(e) => setGroupId(Number(e.target.value))}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.code} · {g.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="s-code">รหัสวิชา</Label>
            <Input id="s-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="เช่น ET101" autoFocus />
          </div>
          <div>
            <Label htmlFor="s-teacher">ครูผู้สอน</Label>
            <Input id="s-teacher" value={teacherName} onChange={(e) => setTeacherName(e.target.value)} placeholder="ไม่บังคับ" />
          </div>
        </div>
        <div>
          <Label htmlFor="s-name">ชื่อวิชา</Label>
          <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น การตัดต่อวิดีโอ" />
        </div>
        <div>
          <Label htmlFor="s-desc">คำอธิบาย (ไม่บังคับ)</Label>
          <Textarea id="s-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
