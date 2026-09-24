'use client';

import { useState, useTransition } from 'react';
import { Plus, Pencil, Trash2, FolderKanban, Power, Check, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardHeader, Button, Input, Label, Textarea, Badge, EmptyState } from '@/components/ui';
import { Modal } from '@/components/dialog';
import { useDialog } from '@/components/dialog';
import { cn } from '@/lib/utils';
import { GROUP_COLORS, groupColorLabel, groupTint } from '@/lib/group-color';
import { saveGroup, toggleGroup, deleteGroup } from './actions';

export interface GroupItem {
  id: number;
  code: string;
  name: string;
  description: string | null;
  color: string | null;
  active: boolean;
  subjectCount: number;
}

export function GroupsManager({ groups }: { groups: GroupItem[] }) {
  const [editing, setEditing] = useState<GroupItem | null>(null);
  const [creating, setCreating] = useState(false);
  const dialog = useDialog();
  const [, start] = useTransition();

  async function remove(g: GroupItem) {
    const ok = await dialog.confirm({
      title: `ลบกลุ่ม “${g.name}”?`,
      description: 'การลบทำได้เฉพาะกลุ่มที่ไม่มีวิชาอยู่',
      tone: 'destructive',
    });
    if (!ok) return;
    const r = await deleteGroup(g.id);
    r.ok ? toast.success(r.message) : toast.error(r.message);
  }

  async function toggle(g: GroupItem) {
    const r = await toggleGroup(g.id, !g.active);
    r.ok ? toast.success(r.message) : toast.error(r.message);
    start(() => {});
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">กลุ่มวิชา</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            กลุ่ม/หมวดหมู่วิชาเสริม เช่น “ET” — แต่ละกลุ่มมีได้หลายวิชา
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4.5" strokeWidth={1.8} />
          เพิ่มกลุ่ม
        </Button>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="size-8" strokeWidth={1.5} />}
          title="ยังไม่มีกลุ่มวิชา"
          hint="เริ่มด้วยการเพิ่มกลุ่มวิชาแรก แล้วจึงเพิ่มวิชาในกลุ่ม"
        />
      ) : (
        <Card>
          <CardHeader icon={<FolderKanban className="size-4.5" strokeWidth={1.8} />} title={`ทั้งหมด ${groups.length} กลุ่ม`} />
          <ul className="divide-y divide-border/60">
            {groups.map((g) => {
              const tint = groupTint(g.color);
              return (
                <li key={g.id} className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
                  <span
                    className={cn(
                      'grid size-11 shrink-0 place-items-center rounded-xl text-sm font-bold',
                      !tint && 'bg-primary/10 text-primary',
                    )}
                    style={tint?.chip}
                  >
                    {g.code}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{g.name}</p>
                      {!g.active ? <Badge tone="secondary">ปิดใช้งาน</Badge> : null}
                      <Badge tone="primary">{g.subjectCount} วิชา</Badge>
                      {tint ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="size-2.5 rounded-full" style={tint.solid} />
                          {groupColorLabel(g.color)}
                        </span>
                      ) : null}
                    </div>
                    {g.description ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{g.description}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => toggle(g)}
                      title={g.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                      className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                    >
                      <Power className="size-4.5" strokeWidth={1.8} />
                    </button>
                    <button
                      onClick={() => setEditing(g)}
                      title="แก้ไข"
                      className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                    >
                      <Pencil className="size-4.5" strokeWidth={1.8} />
                    </button>
                    <button
                      onClick={() => remove(g)}
                      title="ลบ"
                      className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4.5" strokeWidth={1.8} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {creating ? <GroupForm onClose={() => setCreating(false)} /> : null}
      {editing ? <GroupForm group={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function GroupForm({ group, onClose }: { group?: GroupItem; onClose: () => void }) {
  const [code, setCode] = useState(group?.code ?? '');
  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [color, setColor] = useState<string | null>(group?.color ?? null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (saving) return;
    setSaving(true);
    const r = await saveGroup(group?.id ?? null, { code, name, description, color });
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
      labelledBy="group-form-title"
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
      <h2 id="group-form-title" className="text-base font-semibold">
        {group ? 'แก้ไขกลุ่มวิชา' : 'เพิ่มกลุ่มวิชา'}
      </h2>
      <div className="mt-4 space-y-3.5">
        <div>
          <Label htmlFor="g-code">รหัสกลุ่ม</Label>
          <Input id="g-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="เช่น ET" autoFocus />
        </div>
        <div>
          <Label htmlFor="g-name">ชื่อกลุ่ม</Label>
          <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น Education Technology" />
        </div>
        <div>
          <Label htmlFor="g-desc">คำอธิบาย (ไม่บังคับ)</Label>
          <Textarea id="g-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <ColorPicker code={code} name={name} value={color} onChange={setColor} />
      </div>
    </Modal>
  );
}

/**
 * สีของกลุ่ม — a row of swatches plus a live preview of how the กลุ่ม will
 * look on the other screens, so the choice is made against the real thing.
 */
function ColorPicker({
  code,
  name,
  value,
  onChange,
}: {
  code: string;
  name: string;
  value: string | null;
  onChange: (key: string | null) => void;
}) {
  const tint = groupTint(value);
  return (
    <div>
      <Label id="g-color-label">สีของกลุ่ม</Label>
      <div role="radiogroup" aria-labelledby="g-color-label" className="flex flex-wrap gap-2">
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          aria-label="ไม่มีสี"
          title="ไม่มีสี"
          onClick={() => onChange(null)}
          className={cn(
            'grid size-9 place-items-center rounded-full border-2 text-muted-foreground transition',
            value === null ? 'border-foreground' : 'border-border hover:border-muted-foreground',
          )}
        >
          <Ban className="size-4" strokeWidth={1.8} />
        </button>
        {GROUP_COLORS.map((c) => {
          const on = value === c.key;
          return (
            <button
              key={c.key}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={c.label}
              title={c.label}
              onClick={() => onChange(c.key)}
              className={cn(
                'grid size-9 place-items-center rounded-full ring-offset-2 ring-offset-card transition',
                on ? 'ring-2 ring-foreground' : 'hover:scale-110',
              )}
              style={{ backgroundColor: c.hex }}
            >
              {on ? <Check className="size-4.5 text-white" strokeWidth={3} /> : null}
            </button>
          );
        })}
      </div>
      <div
        className={cn(
          'mt-3 flex items-center gap-3 rounded-xl border px-3 py-2.5',
          !tint && 'border-border bg-card',
        )}
        style={tint?.surface}
      >
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-lg text-xs font-bold',
            !tint && 'bg-primary/10 text-primary',
          )}
          style={tint?.chip}
        >
          {code.trim() || 'ET'}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{name.trim() || 'ชื่อกลุ่มวิชา'}</p>
          <p className="text-xs text-muted-foreground">
            ตัวอย่าง — วิชาและ Track ของกลุ่มนี้จะแสดงด้วยสีนี้
          </p>
        </div>
      </div>
    </div>
  );
}
