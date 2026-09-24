'use client';

import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, School, Users, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardHeader, Button, Input, Label, Textarea, Badge, EmptyState } from '@/components/ui';
import { Modal, useDialog } from '@/components/dialog';
import { StudentPicker, type PickStudent } from '@/components/student-picker';
import { saveClassroom, deleteClassroom, setClassroomMembers } from './actions';

export interface ClassroomItem {
  id: number;
  name: string;
  note: string | null;
  memberIds: number[];
}

export function ClassroomsManager({
  yearLabel,
  classrooms,
  students,
}: {
  yearLabel: string;
  classrooms: ClassroomItem[];
  students: PickStudent[];
}) {
  const [editing, setEditing] = useState<ClassroomItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState<ClassroomItem | null>(null);
  const dialog = useDialog();
  const nameById = new Map(students.map((s) => [s.id, s.fullName]));

  async function remove(c: ClassroomItem) {
    const ok = await dialog.confirm({
      title: `ลบห้อง “${c.name}”?`,
      description: `สมาชิก ${c.memberIds.length} คนจะถูกนำออกจากห้องนี้`,
      tone: 'destructive',
    });
    if (!ok) return;
    const r = await deleteClassroom(c.id);
    r.ok ? toast.success(r.message) : toast.error(r.message);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ห้องเรียนพิเศษ</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            จัดกลุ่มห้องเรียนใหม่แยกจากห้องประจำ · {yearLabel} — ห้องนี้ไม่ต้องมีครูที่ปรึกษา
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4.5" strokeWidth={1.8} />
          เพิ่มห้อง
        </Button>
      </div>

      {classrooms.length === 0 ? (
        <EmptyState
          icon={<School className="size-8" strokeWidth={1.5} />}
          title="ยังไม่มีห้องเรียนพิเศษ"
          hint="สร้างห้องแล้วเพิ่มนักเรียน ม.4-6 เข้าห้องได้ตามต้องการ"
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {classrooms.map((c) => (
            <Card key={c.id} className="flex flex-col">
              <CardHeader
                icon={<School className="size-4.5" strokeWidth={1.8} />}
                title={c.name}
                action={
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditing(c)} title="แก้ไขชื่อ" className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary/60 hover:text-foreground">
                      <Pencil className="size-4" strokeWidth={1.8} />
                    </button>
                    <button onClick={() => remove(c)} title="ลบ" className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 className="size-4" strokeWidth={1.8} />
                    </button>
                  </div>
                }
              />
              <div className="flex flex-1 flex-col px-4 pb-4 sm:px-5">
                {c.note ? <p className="mb-2 text-xs text-muted-foreground">{c.note}</p> : null}
                <Badge tone="navy" className="self-start">
                  <Users className="size-3.5" strokeWidth={2} /> {c.memberIds.length} คน
                </Badge>
                <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => setManaging(c)}>
                  จัดการสมาชิก
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {creating ? <ClassroomForm onClose={() => setCreating(false)} /> : null}
      {editing ? <ClassroomForm classroom={editing} onClose={() => setEditing(null)} /> : null}
      {managing ? (
        <MembersEditor
          classroom={managing}
          students={students}
          nameById={nameById}
          onClose={() => setManaging(null)}
        />
      ) : null}
    </div>
  );
}

function ClassroomForm({ classroom, onClose }: { classroom?: ClassroomItem; onClose: () => void }) {
  const [name, setName] = useState(classroom?.name ?? '');
  const [note, setNote] = useState(classroom?.note ?? '');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (saving) return;
    setSaving(true);
    const r = await saveClassroom(classroom?.id ?? null, { name, note });
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
      labelledBy="cr-form-title"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button onClick={submit} disabled={saving}>บันทึก</Button>
        </>
      }
    >
      <h2 id="cr-form-title" className="text-base font-semibold">
        {classroom ? 'แก้ไขห้อง' : 'เพิ่มห้องเรียนพิเศษ'}
      </h2>
      <div className="mt-4 space-y-3.5">
        <div>
          <Label htmlFor="cr-name">ชื่อห้อง</Label>
          <Input id="cr-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ห้องโครงงาน ก" autoFocus />
        </div>
        <div>
          <Label htmlFor="cr-note">หมายเหตุ (ไม่บังคับ)</Label>
          <Textarea id="cr-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

/**
 * Paste-a-list-of-codes shortcut for the members editor: turns a blob of student
 * codes (from Excel, LINE, whatever) into selections in one go, instead of
 * ticking people off the list one by one. Codes that match nothing stay in the
 * box so they can be fixed and re-submitted.
 */
function CodeBulkAdd({
  students,
  selected,
  onAdd,
}: {
  students: PickStudent[];
  selected: Set<number>;
  onAdd: (ids: number[]) => void;
}) {
  const [text, setText] = useState('');
  const [missing, setMissing] = useState<string[]>([]);

  // Keyed by the raw code and again without leading zeros, so "0123" and "123"
  // both land on the same student.
  const byCode = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of students) {
      const code = s.code.trim().toLowerCase();
      if (!code) continue;
      m.set(code, s.id);
      const bare = code.replace(/^0+/, '');
      if (bare && !m.has(bare)) m.set(bare, s.id);
    }
    return m;
  }, [students]);

  function apply() {
    const codes = [...new Set(text.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean))];
    if (codes.length === 0) {
      toast.error('ยังไม่ได้ใส่รหัสนักเรียน');
      return;
    }

    const ids: number[] = [];
    const notFound: string[] = [];
    for (const raw of codes) {
      const key = raw.toLowerCase();
      const id = byCode.get(key) ?? byCode.get(key.replace(/^0+/, ''));
      if (id === undefined) notFound.push(raw);
      else ids.push(id);
    }

    const added = ids.filter((id) => !selected.has(id)).length;
    const dup = ids.length - added;
    if (ids.length > 0) onAdd(ids);
    setMissing(notFound);
    setText(notFound.join('\n'));

    if (added > 0) {
      toast.success(`เพิ่ม ${added} คน${dup > 0 ? ` (มีอยู่แล้ว ${dup} คน)` : ''}`);
    } else if (dup > 0) {
      toast.info(`นักเรียน ${dup} คนอยู่ในห้องนี้อยู่แล้ว`);
    }
    if (notFound.length > 0) toast.error(`ไม่พบรหัส ${notFound.length} รายการ`);
  }

  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-3.5">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ClipboardList className="size-4.5 text-muted-foreground" strokeWidth={1.8} />
        เพิ่มด้วยรหัสนักเรียน
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        วางรหัสได้หลายคนพร้อมกัน คั่นด้วยการขึ้นบรรทัดใหม่ เว้นวรรค หรือคอมมา
      </p>
      <Textarea
        rows={3}
        value={text}
        onChange={(e) => { setText(e.target.value); setMissing([]); }}
        placeholder={'12345\n12346, 12347'}
        className="mt-2.5 bg-card font-mono text-sm"
      />
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        {missing.length > 0 ? (
          <p className="text-xs text-destructive">
            ไม่พบรหัสเหล่านี้ในรายชื่อนักเรียน — {missing.join(', ')}
          </p>
        ) : (
          <span />
        )}
        <Button variant="secondary" size="sm" onClick={apply} disabled={!text.trim()}>
          เพิ่มเข้าห้อง
        </Button>
      </div>
    </div>
  );
}

function MembersEditor({
  classroom,
  students,
  nameById,
  onClose,
}: {
  classroom: ClassroomItem;
  students: PickStudent[];
  nameById: Map<number, string>;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set(classroom.memberIds));
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
    const r = await setClassroomMembers(classroom.id, [...selected]);
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
      labelledBy="cr-members-title"
      className="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <Button onClick={submit} disabled={saving}>บันทึกสมาชิก ({selected.size})</Button>
        </>
      }
    >
      <h2 id="cr-members-title" className="text-base font-semibold">
        สมาชิกห้อง “{classroom.name}”
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">เลือกนักเรียน ม.4-6 เข้าห้องนี้</p>
      <div className="mt-4">
        <CodeBulkAdd students={students} selected={selected} onAdd={(ids) => bulk(ids, true)} />
      </div>
      <div className="mt-4">
        <StudentPicker students={students} selected={selected} onToggle={toggle} onBulk={bulk} />
      </div>
    </Modal>
  );
}
