'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/authz';
import { logActivity } from '@/lib/log';
import { runFullSync, runSyncStep, SYNC_KIND_LABEL, type SyncKind } from '@/lib/auto-sync';
import type { ActionResult } from '@/components/action-button';

/**
 * The manual half of the sync. Every button here runs the same step the
 * background scheduler runs (`runSyncStep`), so a hand-pressed sync and an
 * automatic one leave identical state behind — including the `sync_state` row
 * the screen reads back.
 */

function refresh() {
  revalidatePath('/admin/people');
  revalidatePath('/admin/years');
  revalidatePath('/admin');
}

async function manualStep(kind: SyncKind): Promise<ActionResult> {
  const user = await requireRole('admin');
  const r = await runSyncStep(kind, 'manual');
  await logActivity(user, `sync_${kind}`, 'manual', { ok: r.ok, message: r.message });
  refresh();
  return r.ok
    ? { ok: true, message: `ซิงก์${SYNC_KIND_LABEL[kind]}สำเร็จ: ${r.message}` }
    : { ok: false, message: `ซิงก์${SYNC_KIND_LABEL[kind]}ไม่สำเร็จ: ${r.message}` };
}

export async function syncStudentsAction(): Promise<ActionResult> {
  return manualStep('students');
}

export async function syncTeachersAction(): Promise<ActionResult> {
  return manualStep('teachers');
}

export async function syncHomeroomsAction(): Promise<ActionResult> {
  return manualStep('homerooms');
}

/** ปี → นักเรียน → ครู → ครูที่ปรึกษา in one press — the dependency order. */
export async function syncAllAction(): Promise<ActionResult> {
  const user = await requireRole('admin');
  const out = await runFullSync('manual');
  if (out.length === 0)
    return { ok: false, message: 'มีการซิงก์กำลังทำงานอยู่ — รอสักครู่แล้วลองใหม่' };

  await logActivity(user, 'sync_all', 'manual', {
    steps: out.map((o) => ({ kind: o.kind, ok: o.ok, message: o.message })),
  });
  refresh();

  const failed = out.filter((o) => !o.ok);
  if (failed.length === 0)
    return { ok: true, message: `ซิงก์ทั้งหมดสำเร็จ (${out.length} รายการ)` };
  return {
    ok: false,
    message: `ซิงก์ไม่ครบ — ${failed
      .map((f) => `${SYNC_KIND_LABEL[f.kind]}: ${f.message}`)
      .join(' · ')}`,
  };
}
