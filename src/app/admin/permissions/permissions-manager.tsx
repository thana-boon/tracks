'use client';

import { useMemo, useState } from 'react';
import { Search, ShieldPlus, ShieldCheck, ShieldX, Lock, UserPlus, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  Card,
  CardHeader,
  Button,
  Input,
  Label,
  Badge,
  EmptyState,
  Textarea,
} from '@/components/ui';
import { Modal, useDialog } from '@/components/dialog';
import { cn, thaiDateLongOf } from '@/lib/utils';
import { grantAdminAction, revokeAdminAction } from './actions';

export interface GrantItem {
  personId: number;
  code: string;
  fullName: string;
  status: string;
  note: string | null;
  grantedByName: string;
  createdAt: Date;
}

export interface TeacherItem {
  id: number;
  code: string;
  fullName: string;
  status: string;
}

/**
 * สิทธิ์ผู้ดูแล — two lists that must never be confused with each other.
 *
 * The upper one is what this school controls: admin granted here, revocable
 * here. The lower one is the Users Service's own `teacher-admin` list, shown
 * read-only so an admin can see who is already covered and not go looking for a
 * grant that would do nothing.
 */
export function PermissionsManager({
  grants,
  candidates,
  schoolosAdmins,
  selfPersonId,
}: {
  grants: GrantItem[];
  /** teachers eligible for a grant — already excludes SchoolOS admins */
  candidates: TeacherItem[];
  schoolosAdmins: TeacherItem[];
  /** the person id of whoever is looking, so they cannot revoke themselves */
  selfPersonId: number | null;
}) {
  const [adding, setAdding] = useState(false);
  const dialog = useDialog();

  const granted = new Set(grants.map((g) => g.personId));
  const free = candidates.filter((t) => !granted.has(t.id));

  async function revoke(g: GrantItem) {
    const ok = await dialog.confirm({
      title: `ถอนสิทธิ์ผู้ดูแลของ ${g.fullName}?`,
      description:
        'จะกลับไปเป็นครูธรรมดาทันทีในหน้าถัดไปที่เปิด — ข้อมูลและสิทธิ์ในระบบผู้ใช้ (SchoolOS) ไม่ถูกแตะต้อง',
      tone: 'destructive',
      confirmLabel: 'ถอนสิทธิ์',
    });
    if (!ok) return;
    const r = await revokeAdminAction(g.personId);
    if (r.ok) toast.success(r.message);
    else toast.error(r.message);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">สิทธิ์ผู้ดูแล</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ดึงครูขึ้นมาเป็นผู้ดูแล <span className="font-medium text-foreground">เฉพาะระบบวิชาเสริมนี้</span> —
            ไม่เขียนกลับไปที่ SchoolOS และไม่กระทบสิทธิ์ผู้ดูแลที่มาจากระบบผู้ใช้
          </p>
        </div>
        <Button onClick={() => setAdding(true)} disabled={free.length === 0}>
          <ShieldPlus className="size-4.5" strokeWidth={1.8} />
          เพิ่มผู้ดูแล
        </Button>
      </div>

      <Card>
        <CardHeader
          icon={<ShieldCheck className="size-4.5" strokeWidth={1.8} />}
          title="ผู้ดูแลที่ให้สิทธิ์ในระบบนี้"
          action={<Badge tone="primary">{grants.length} คน</Badge>}
        />
        {grants.length === 0 ? (
          <div className="px-4 pb-5 sm:px-5">
            <EmptyState
              icon={<ShieldPlus className="size-8" strokeWidth={1.5} />}
              title="ยังไม่ได้ให้สิทธิ์ผู้ดูแลแก่ครูคนใด"
              hint="กด “เพิ่มผู้ดูแล” เพื่อเลือกครู — ครูคนนั้นจะเห็นเมนูผู้ดูแลทั้งหมดในระบบวิชาเสริม"
            />
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {grants.map((g) => (
              <li key={g.personId} className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <ShieldCheck className="size-5" strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{g.fullName}</p>
                    <span className="text-xs text-muted-foreground tabular-nums">{g.code}</span>
                    {g.personId === selfPersonId ? <Badge tone="navy">คุณ</Badge> : null}
                    {g.status !== 'active' && g.status !== 'studying' ? (
                      <Badge tone="destructive">{g.status}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {g.note ? `${g.note} · ` : ''}ให้สิทธิ์โดย {g.grantedByName} ·{' '}
                    {thaiDateLongOf(g.createdAt)}
                  </p>
                </div>
                <button
                  onClick={() => revoke(g)}
                  title="ถอนสิทธิ์"
                  className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <ShieldX className="size-4.5" strokeWidth={1.8} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          icon={<Lock className="size-4.5" strokeWidth={1.8} />}
          title="ผู้ดูแลจากระบบผู้ใช้ (SchoolOS)"
          action={<Badge tone="secondary">{schoolosAdmins.length} คน</Badge>}
        />
        <div className="px-4 pb-4 sm:px-5">
          <p className="pb-3 text-xs text-muted-foreground">
            ครูที่มีตำแหน่ง <span className="font-medium">teacher-admin</span> ในระบบผู้ใช้ —
            เป็นผู้ดูแลที่นี่โดยอัตโนมัติ แก้ไขหรือถอนจากหน้านี้ไม่ได้ ต้องแก้ที่ SchoolOS
          </p>
          {schoolosAdmins.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
              ยังไม่พบครูที่เป็น teacher-admin — ถ้ายังไม่เคยซิงก์ครู ให้ซิงก์รายชื่อก่อน
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {schoolosAdmins.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-2.5 py-1.5 text-sm"
                >
                  <Lock className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
                  <span>{t.fullName}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{t.code}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {adding ? <GrantForm teachers={free} onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

/** Pick one teacher, optionally say why, grant. */
function GrantForm({ teachers, onClose }: { teachers: TeacherItem[]; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return teachers.slice(0, 60);
    return teachers
      .filter(
        (t) =>
          t.fullName.toLowerCase().includes(needle) || t.code.toLowerCase().includes(needle),
      )
      .slice(0, 60);
  }, [teachers, q]);

  async function submit() {
    if (saving || picked === null) return;
    setSaving(true);
    const r = await grantAdminAction(picked, note);
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
      labelledBy="grant-form-title"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button onClick={submit} disabled={saving || picked === null}>
            <ShieldPlus className="size-4.5" strokeWidth={1.8} />
            ให้สิทธิ์ผู้ดูแล
          </Button>
        </>
      }
    >
      <h2 id="grant-form-title" className="text-base font-semibold">
        เพิ่มผู้ดูแลของระบบวิชาเสริม
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        เลือกครู 1 คน — สิทธิ์มีผลเฉพาะระบบนี้ และถอนคืนได้ทุกเมื่อ
      </p>

      <div className="mt-4 space-y-3.5">
        <div>
          <Label htmlFor="grant-q">ค้นหาครู</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              strokeWidth={1.8}
            />
            <Input
              id="grant-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ชื่อ หรือ รหัสครู"
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
          {shown.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {teachers.length === 0
                ? 'ครูทุกคนที่เพิ่มได้ มีสิทธิ์อยู่แล้ว'
                : 'ไม่พบครูตามคำค้น'}
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {shown.map((t) => {
                const on = picked === t.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setPicked(on ? null : t.id)}
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                        on ? 'bg-primary/5' : 'hover:bg-secondary/50',
                      )}
                    >
                      <span
                        className={cn(
                          'grid size-5 shrink-0 place-items-center rounded-md border',
                          on
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border',
                        )}
                      >
                        {on ? <Check className="size-3.5" strokeWidth={3} /> : null}
                      </span>
                      <span className="w-16 shrink-0 text-xs text-muted-foreground tabular-nums">
                        {t.code}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">{t.fullName}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <Label htmlFor="grant-note">เหตุผล (ไม่บังคับ)</Label>
          <Textarea
            id="grant-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="เช่น ผู้ช่วยงานวิชาการ ดูแลวิชาเสริม ม.5"
          />
        </div>

        <p className="flex items-start gap-2 rounded-xl border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
          <UserPlus className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} />
          ครูที่ได้สิทธิ์จะเห็นเมนูผู้ดูแลทั้งหมด — จัดการวิชา จัดนักเรียนเข้าเรียน ทรานสคริปต์
          สำรองข้อมูล และหน้าสิทธิ์นี้
        </p>
      </div>
    </Modal>
  );
}
