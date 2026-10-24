'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { KeyRound, Plus, Ban, Copy, Check, TriangleAlert, PlugZap, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardHeader, Button, Input, Label, Badge, EmptyState } from '@/components/ui';
import { Modal, useDialog } from '@/components/dialog';
import { withBasePath } from '@/lib/base-path';
import { cn, thaiDateLongOf, thaiRelativeTime } from '@/lib/utils';
import { createApiKeyAction, revokeApiKeyAction } from './actions';

export interface KeyItem {
  id: number;
  name: string;
  prefix: string;
  createdByName: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  revokedByName: string | null;
}

/**
 * กุญแจ API — keys another system uses to read the day's ตาราง and send its
 * เช็คชื่อ back. The list shows only the first characters of each key: the
 * whole key is on screen once, in the dialog that issues it.
 */
export function ApiKeysManager({ keys }: { keys: KeyItem[] }) {
  const [adding, setAdding] = useState(false);
  const dialog = useDialog();
  const live = keys.filter((k) => !k.revokedAt);

  async function revoke(k: KeyItem) {
    const ok = await dialog.confirm({
      title: `ยกเลิกกุญแจของ ${k.name}?`,
      description:
        'ระบบนั้นจะเรียก API ไม่ได้ตั้งแต่คำขอถัดไป — เช็คชื่อที่ส่งมาแล้วยังอยู่ครบ ถ้าจะใช้ต่อต้องออกกุญแจใหม่',
      tone: 'destructive',
      confirmLabel: 'ยกเลิกกุญแจ',
    });
    if (!ok) return;
    const r = await revokeApiKeyAction(k.id);
    if (r.ok) toast.success(r.message);
    else toast.error(r.message);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">กุญแจ API</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ให้ระบบอื่นถามว่าวันนี้มีวิชาเสริมหรือไม่ และส่งผลเช็คชื่อกลับมาบันทึกที่นี่
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus className="size-4.5" strokeWidth={1.8} />
          ออกกุญแจใหม่
        </Button>
      </div>

      <Card>
        <CardHeader
          icon={<KeyRound className="size-4.5" strokeWidth={1.8} />}
          title="กุญแจที่ออกไว้"
          action={<Badge tone="primary">ใช้งาน {live.length}</Badge>}
        />
        {keys.length === 0 ? (
          <div className="px-4 pb-5 sm:px-5">
            <EmptyState
              icon={<KeyRound className="size-8" strokeWidth={1.5} />}
              title="ยังไม่ได้ออกกุญแจให้ระบบใด"
              hint="กด “ออกกุญแจใหม่” แล้วตั้งชื่อตามระบบที่จะใช้ เช่น ระบบสแกนหน้า"
            />
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
                <span
                  className={cn(
                    'grid size-11 shrink-0 place-items-center rounded-xl',
                    k.revokedAt ? 'bg-secondary text-muted-foreground' : 'bg-primary/10 text-primary',
                  )}
                >
                  <KeyRound className="size-5" strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={cn('font-medium', k.revokedAt && 'text-muted-foreground line-through')}>
                      {k.name}
                    </p>
                    <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">{k.prefix}…</code>
                    {k.revokedAt ? <Badge tone="destructive">ยกเลิกแล้ว</Badge> : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {k.revokedAt
                      ? `ยกเลิกโดย ${k.revokedByName ?? '—'} · ${thaiDateLongOf(k.revokedAt)}`
                      : `ใช้ล่าสุด ${k.lastUsedAt ? thaiRelativeTime(k.lastUsedAt) : 'ยังไม่เคยใช้'}`}
                    {' · '}ออกโดย {k.createdByName} · {thaiDateLongOf(k.createdAt)}
                  </p>
                </div>
                {k.revokedAt ? null : (
                  <button
                    onClick={() => revoke(k)}
                    title="ยกเลิกกุญแจ"
                    aria-label={`ยกเลิกกุญแจของ ${k.name}`}
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Ban className="size-4.5" strokeWidth={1.8} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <HowTo />

      {adding ? <NewKeyForm onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

/** The two calls, written out with this deployment's own address. */
function HowTo() {
  const [base, setBase] = useState(withBasePath('/api/public/v1'));
  // The origin is only known in the browser — the same app is opened by name and by IP.
  useEffect(() => setBase(`${window.location.origin}${withBasePath('/api/public/v1')}`), []);

  return (
    <Card>
      <CardHeader
        icon={<PlugZap className="size-4.5" strokeWidth={1.8} />}
        title="วิธีเรียกใช้"
        action={
          <Link
            href="/api-docs"
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary/60"
          >
            <BookOpen className="size-3.5" strokeWidth={1.8} />
            วิธีใช้ฉบับเต็ม
          </Link>
        }
      />
      <div className="space-y-4 px-4 pb-5 text-sm sm:px-5">
        <p className="text-muted-foreground">
          ส่งลิงก์ “วิธีใช้ฉบับเต็ม” ให้ผู้พัฒนาระบบนั้นได้เลย — เปิดได้โดยไม่ต้องล็อกอิน และไม่มีกุญแจหรือข้อมูลนักเรียนอยู่ในหน้า
        </p>
        <p className="text-muted-foreground">
          ส่งกุญแจใน header <code className="rounded bg-secondary px-1">X-API-Key</code> ทุกครั้ง · วันที่ใช้รูปแบบ{' '}
          <code className="rounded bg-secondary px-1">YYYY-MM-DD</code> ถ้าไม่ส่งคือวันนี้
        </p>

        <div>
          <p className="font-medium">1. วันนี้มีวิชาเสริมหรือไม่ และมีใครเรียนบ้าง</p>
          <Code>{`curl -H "X-API-Key: trk_…" "${base}/schedule?date=2026-10-24"`}</Code>
          <p className="mt-1.5 text-xs text-muted-foreground">
            ได้ <code>hasClasses</code> (true/false) และ <code>sections</code> — กลุ่มเรียนที่เรียนวันนั้น
            พร้อมรายชื่อนักเรียน (<code>code</code> = รหัสนักเรียน) และสถานะเช็คชื่อเช้า/บ่ายที่บันทึกไว้แล้ว
          </p>
        </div>

        <div>
          <p className="font-medium">2. ส่งผลเช็คชื่อกลับมา</p>
          <Code>{`curl -X POST "${base}/attendance" \\
  -H "X-API-Key: trk_…" -H "Content-Type: application/json" \\
  -d '{"date":"2026-10-24","slot":"morning",
       "records":[{"studentCode":"12345","present":true}]}'`}</Code>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
            <li>
              <code>slot</code> คือ <code>morning</code> (เช้า) หรือ <code>afternoon</code> (บ่าย)
            </li>
            <li>ระบบหากลุ่มเรียนของนักเรียนวันนั้นให้เอง — ส่ง <code>sectionId</code> เฉพาะเมื่อนักเรียนมี 2 กลุ่มในวันเดียว</li>
            <li>บันทึกเฉพาะคนที่ส่งมา — คนที่ไม่ได้ส่งยังเป็น “ยังไม่เช็ค” ไม่ใช่ “ไม่มา” · ส่งซ้ำได้ ทับของเดิม</li>
            <li>
              คนที่บันทึกไม่ได้ (รหัสผิด / ไม่มีเรียนวันนั้น) ส่งกลับใน <code>rejected</code> พร้อมเหตุผล
              ส่วนที่เหลือบันทึกตามปกติ
            </li>
          </ul>
        </div>
      </div>
    </Card>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-1.5 overflow-x-auto rounded-xl border border-border bg-secondary/40 p-3 text-xs leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

/** Name it, issue it, show it once. */
function NewKeyForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit() {
    if (saving || !name.trim()) return;
    setSaving(true);
    const r = await createApiKeyAction(name);
    setSaving(false);
    if (r.ok && r.key) setKey(r.key);
    else toast.error(r.message);
  }

  async function copy() {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
    } catch {
      toast.error('คัดลอกไม่ได้ — เลือกข้อความแล้วคัดลอกเอง');
    }
  }

  if (key) {
    return (
      <Modal
        labelledBy="new-key-title"
        closeOnBackdrop={false}
        onClose={onClose}
        footer={<Button onClick={onClose}>เก็บกุญแจแล้ว</Button>}
      >
        <h2 id="new-key-title" className="text-base font-semibold">
          กุญแจของ {name.trim()}
        </h2>
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.8} />
          แสดงครั้งเดียวเท่านั้น — ปิดหน้าต่างนี้แล้วจะดูอีกไม่ได้ ถ้าหายให้ยกเลิกแล้วออกใหม่
        </p>
        <div className="mt-3 flex items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-lg border border-border bg-secondary/40 px-3 py-2.5 text-xs select-all">
            {key}
          </code>
          <Button variant="outline" size="sm" onClick={copy} aria-label="คัดลอกกุญแจ">
            {copied ? <Check className="size-4" strokeWidth={2} /> : <Copy className="size-4" strokeWidth={1.8} />}
            {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      onClose={onClose}
      labelledBy="new-key-form-title"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button onClick={submit} disabled={saving || !name.trim()}>
            <KeyRound className="size-4.5" strokeWidth={1.8} />
            ออกกุญแจ
          </Button>
        </>
      }
    >
      <h2 id="new-key-form-title" className="text-base font-semibold">
        ออกกุญแจ API ใหม่
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        กุญแจนี้อ่านตารางวิชาเสริมพร้อมรายชื่อนักเรียน และบันทึกเช็คชื่อได้ — ให้เฉพาะระบบที่ไว้ใจ
      </p>
      <div className="mt-4">
        <Label htmlFor="key-name">ชื่อระบบที่จะใช้</Label>
        <Input
          id="key-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="เช่น ระบบสแกนหน้า อาคาร 3"
          maxLength={80}
          autoFocus
        />
      </div>
    </Modal>
  );
}
