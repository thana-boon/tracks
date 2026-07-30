'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/authz';
import { logActivity } from '@/lib/log';
import {
  createBackup,
  deleteBackup,
  restoreBackup,
  restoreFromBuffer,
} from '@/lib/backup';
import type { ActionResult } from '@/components/action-button';

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export async function createBackupAction(): Promise<ActionResult> {
  const user = await requireRole('admin');
  try {
    const f = await createBackup();
    await logActivity(user, 'create_backup', f.name, { size: f.size });
    revalidatePath('/admin/backup');
    return { ok: true, message: `สำรองข้อมูลสำเร็จ: ${f.name} (${fmtSize(f.size)})` };
  } catch (e) {
    return { ok: false, message: `สำรองไม่สำเร็จ: ${e instanceof Error ? e.message : 'error'}` };
  }
}

export async function deleteBackupAction(name: string): Promise<ActionResult> {
  const user = await requireRole('admin');
  try {
    await deleteBackup(name);
    await logActivity(user, 'delete_backup', name);
    revalidatePath('/admin/backup');
    return { ok: true, message: 'ลบไฟล์สำรองแล้ว' };
  } catch (e) {
    return { ok: false, message: `ลบไม่สำเร็จ: ${e instanceof Error ? e.message : 'error'}` };
  }
}

export async function restoreBackupAction(name: string): Promise<ActionResult> {
  const user = await requireRole('admin');
  try {
    await restoreBackup(name);
    await logActivity(user, 'restore_backup', name);
    revalidatePath('/', 'layout');
    return { ok: true, message: `กู้คืนข้อมูลจาก ${name} สำเร็จ` };
  } catch (e) {
    return { ok: false, message: `กู้คืนไม่สำเร็จ: ${e instanceof Error ? e.message : 'error'}` };
  }
}

export async function restoreUploadAction(formData: FormData): Promise<ActionResult> {
  const user = await requireRole('admin');
  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, message: 'ไม่พบไฟล์' };
  if (file.size === 0) return { ok: false, message: 'ไฟล์ว่างเปล่า' };
  if (file.size > 200 * 1024 * 1024) return { ok: false, message: 'ไฟล์ใหญ่เกิน 200MB' };
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await restoreFromBuffer(buffer);
    await logActivity(user, 'restore_upload', file.name, { size: file.size });
    revalidatePath('/', 'layout');
    return { ok: true, message: `กู้คืนจากไฟล์ ${file.name} สำเร็จ` };
  } catch (e) {
    return { ok: false, message: `กู้คืนไม่สำเร็จ: ${e instanceof Error ? e.message : 'error'}` };
  }
}
