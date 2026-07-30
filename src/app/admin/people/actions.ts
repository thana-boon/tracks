'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/authz';
import { syncStudents, syncTeachers, syncHomerooms } from '@/lib/sync';
import { activeYear } from '@/lib/years';
import { logActivity } from '@/lib/log';
import type { ActionResult } from '@/components/action-button';

export async function syncStudentsAction(): Promise<ActionResult> {
  const user = await requireRole('admin');
  try {
    const c = await syncStudents();
    await logActivity(user, 'sync_students', undefined, c);
    revalidatePath('/admin/people');
    return {
      ok: true,
      message: `ซิงก์นักเรียน ม.4-6 สำเร็จ: เพิ่ม ${c.created}, ปรับปรุง ${c.updated} (ทั้งหมด ${c.total})`,
    };
  } catch (e) {
    return { ok: false, message: `ซิงก์ไม่สำเร็จ: ${e instanceof Error ? e.message : 'error'}` };
  }
}

export async function syncTeachersAction(): Promise<ActionResult> {
  const user = await requireRole('admin');
  try {
    const c = await syncTeachers();
    await logActivity(user, 'sync_teachers', undefined, c);
    revalidatePath('/admin/people');
    return {
      ok: true,
      message: `ซิงก์ครูสำเร็จ: เพิ่ม ${c.created}, ปรับปรุง ${c.updated} (ทั้งหมด ${c.total})`,
    };
  } catch (e) {
    return { ok: false, message: `ซิงก์ไม่สำเร็จ: ${e instanceof Error ? e.message : 'error'}` };
  }
}

export async function syncHomeroomsAction(): Promise<ActionResult> {
  const user = await requireRole('admin');
  const year = await activeYear();
  if (!year) return { ok: false, message: 'ยังไม่ได้ซิงก์ปีการศึกษา — ซิงก์ปีก่อน' };
  try {
    const c = await syncHomerooms(year.id, year.schoolosId);
    await logActivity(user, 'sync_homerooms', `year:${year.year}`, c);
    revalidatePath('/admin/people');
    return {
      ok: true,
      message: `ซิงก์ครูที่ปรึกษาสำเร็จ: ${c.created} รายการ (พบจาก API ${c.total})`,
    };
  } catch (e) {
    return { ok: false, message: `ซิงก์ไม่สำเร็จ: ${e instanceof Error ? e.message : 'error'}` };
  }
}
