'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/authz';
import { syncYears } from '@/lib/sync';
import { logActivity } from '@/lib/log';

export interface ActionResult {
  ok: boolean;
  message: string;
}

export async function syncYearsAction(): Promise<ActionResult> {
  const user = await requireRole('admin');
  try {
    const c = await syncYears();
    await logActivity(user, 'sync_years', undefined, c);
    revalidatePath('/admin/years');
    revalidatePath('/admin', 'layout');
    return {
      ok: true,
      message: `ซิงก์ปีการศึกษาสำเร็จ: เพิ่ม ${c.created}, ปรับปรุง ${c.updated} (ทั้งหมด ${c.total})`,
    };
  } catch (e) {
    return { ok: false, message: `ซิงก์ไม่สำเร็จ: ${e instanceof Error ? e.message : 'error'}` };
  }
}
