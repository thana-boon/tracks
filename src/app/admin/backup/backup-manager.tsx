'use client';

import { useRef, useState } from 'react';
import { DatabaseBackup, Download, Trash2, RotateCcw, Upload, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardHeader, Button, Badge, EmptyState } from '@/components/ui';
import { useDialog } from '@/components/dialog';
import { ActionButton } from '@/components/action-button';
import { thaiDateTimeLongOf } from '@/lib/utils';
import {
  createBackupAction,
  deleteBackupAction,
  restoreBackupAction,
  restoreUploadAction,
} from './actions';

export interface BackupRow {
  name: string;
  size: number;
  createdAt: string; // ISO
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function BackupManager({ backups }: { backups: BackupRow[] }) {
  const dialog = useDialog();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function remove(name: string) {
    const ok = await dialog.confirm({ title: `ลบไฟล์ ${name}?`, tone: 'destructive' });
    if (!ok) return;
    const r = await deleteBackupAction(name);
    r.ok ? toast.success(r.message) : toast.error(r.message);
  }

  async function restore(name: string) {
    const ok = await dialog.confirm({
      title: 'กู้คืนข้อมูล?',
      description: `ข้อมูลปัจจุบันทั้งหมดจะถูกแทนที่ด้วยไฟล์ ${name} — การกระทำนี้ย้อนกลับไม่ได้`,
      tone: 'destructive',
      confirmLabel: 'กู้คืน',
    });
    if (!ok) return;
    const r = await restoreBackupAction(name);
    r.ok ? toast.success(r.message) : toast.error(r.message);
  }

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const ok = await dialog.confirm({
      title: 'กู้คืนจากไฟล์ที่อัปโหลด?',
      description: `ข้อมูลปัจจุบันทั้งหมดจะถูกแทนที่ด้วย ${file.name} — ย้อนกลับไม่ได้`,
      tone: 'destructive',
      confirmLabel: 'กู้คืน',
    });
    if (!ok) {
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setUploading(true);
    const fd = new FormData();
    fd.set('file', file);
    const r = await restoreUploadAction(fd);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
    r.ok ? toast.success(r.message) : toast.error(r.message);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">สำรอง / กู้คืนข้อมูล</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            สำรองฐานข้อมูลวิชาเสริมด้วย pg_dump — เก็บไว้บนเซิร์ฟเวอร์ ดาวน์โหลด หรือกู้คืนได้
          </p>
        </div>
        <ActionButton action={createBackupAction} icon={<Save className="size-4.5" strokeWidth={1.8} />}>
          สำรองข้อมูลเดี๋ยวนี้
        </ActionButton>
      </div>

      <Card className="border-destructive/30 bg-destructive/5">
        <div className="flex items-start gap-3 p-4 sm:p-5">
          <RotateCcw className="mt-0.5 size-5 shrink-0 text-destructive" strokeWidth={1.8} />
          <div className="text-sm">
            <p className="font-medium text-destructive">การกู้คืนเขียนทับข้อมูลทั้งหมด</p>
            <p className="mt-0.5 text-muted-foreground">
              ควรสำรองข้อมูลปัจจุบันก่อนกู้คืนทุกครั้ง — การกู้คืนจะลบและแทนที่ตารางทั้งหมด
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          icon={<Upload className="size-4.5" strokeWidth={1.8} />}
          title="กู้คืนจากไฟล์ภายนอก"
        />
        <div className="flex flex-wrap items-center gap-3 px-4 pb-5 sm:px-5">
          <input
            ref={fileRef}
            type="file"
            accept=".dump"
            className="block w-full max-w-xs text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium file:text-secondary-foreground"
          />
          <Button variant="outline" onClick={upload} disabled={uploading}>
            {uploading ? <Loader2 className="size-4.5 animate-spin" /> : <Upload className="size-4.5" strokeWidth={1.8} />}
            อัปโหลดและกู้คืน
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader icon={<DatabaseBackup className="size-4.5" strokeWidth={1.8} />} title={`ไฟล์สำรอง (${backups.length})`} />
        {backups.length === 0 ? (
          <div className="p-4 sm:p-5">
            <EmptyState title="ยังไม่มีไฟล์สำรอง" hint="กดปุ่ม “สำรองข้อมูลเดี๋ยวนี้” เพื่อสร้างไฟล์แรก" />
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {backups.map((b) => (
              <li key={b.name} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium tabular-nums">{b.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {thaiDateTimeLongOf(new Date(b.createdAt))} · <Badge tone="secondary">{fmtSize(b.size)}</Badge>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <a
                    href={`/api/backup/${encodeURIComponent(b.name)}`}
                    title="ดาวน์โหลด"
                    className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  >
                    <Download className="size-4.5" strokeWidth={1.8} />
                  </a>
                  <button
                    onClick={() => restore(b.name)}
                    title="กู้คืน"
                    className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary"
                  >
                    <RotateCcw className="size-4.5" strokeWidth={1.8} />
                  </button>
                  <button
                    onClick={() => remove(b.name)}
                    title="ลบ"
                    className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4.5" strokeWidth={1.8} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
