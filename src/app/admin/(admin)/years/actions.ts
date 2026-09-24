'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/authz';
import { logActivity } from '@/lib/log';
import { runSyncStep } from '@/lib/auto-sync';

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * Manual "ซิงก์เดี๋ยวนี้" for the calendar. The background scheduler already
 * refreshes it; this exists for the moment a year is switched upstream and the
 * admin does not want to wait for the next tick.
 */
export async function syncYearsAction(): Promise<ActionResult> {
  const user = await requireRole('admin');
  const r = await runSyncStep('years', 'manual');
  await logActivity(user, 'sync_years', 'manual', { ok: r.ok, message: r.message });
  revalidatePath('/admin/years');
  revalidatePath('/admin/people');
  revalidatePath('/admin', 'layout');
  return r.ok
    ? { ok: true, message: `ซิงก์ปีการศึกษาสำเร็จ: ${r.message}` }
    : { ok: false, message: `ซิงก์ไม่สำเร็จ: ${r.message}` };
}
