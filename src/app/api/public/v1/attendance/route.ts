import { revalidatePath } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, requireApiKey } from '@/lib/api-keys';
import { saveFromApi } from '@/lib/attendance-api';
import { logEvent } from '@/lib/log';
import { normalizeYmd, todayYmd } from '@/lib/utils';
import { activeYear } from '@/lib/years';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  /** defaults to today, school time */
  date: z.string().optional(),
  slot: z.enum(['morning', 'afternoon']),
  /** only needed when a นักเรียน has two รอบเรียน on the same day */
  sectionId: z.number().int().positive().optional(),
  records: z
    .array(
      z
        .object({
          studentCode: z.string().trim().min(1).max(40).optional(),
          studentId: z.number().int().positive().optional(),
          present: z.boolean(),
        })
        .refine((r) => r.studentCode !== undefined || r.studentId !== undefined, {
          message: 'studentCode or studentId',
        }),
    )
    .min(1)
    .max(2000),
});

/**
 * POST /api/public/v1/attendance — เช็คชื่อ taken on another system, recorded here.
 *
 * Each นักเรียน is found by รหัสนักเรียน (or our studentId) and placed in the
 * รอบเรียน they sit in on that date. Records that cannot be placed come back
 * in `rejected` with a reason, and the rest are saved — one unknown รหัส in a
 * batch of forty does not throw away the other thirty-nine.
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (auth.response) return auth.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return apiError(400, 'bad_request', 'ข้อมูลไม่ถูกต้อง — ต้องมี slot และ records [{ studentCode, present }]');

  const date = parsed.data.date ? normalizeYmd(parsed.data.date) : todayYmd();
  if (!date) return apiError(400, 'bad_date', 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD');

  const year = await activeYear();
  if (!year) return apiError(503, 'no_active_year', 'ระบบยังไม่ได้ซิงก์ปีการศึกษา');

  const { slot, sectionId, records } = parsed.data;
  const outcome = await saveFromApi({
    year,
    date,
    slot,
    sectionId,
    records,
    actor: `api:${auth.key.id}`,
  });
  if (outcome.sections === null)
    return apiError(422, 'not_scheduled', 'กลุ่มเรียนนี้ไม่ได้เรียนในวันที่ส่งมา');

  if (outcome.saved > 0) {
    await logEvent(`api:${auth.key.id}`, auth.key.name, 'api_save_attendance', `date:${date}`, {
      slot,
      saved: outcome.saved,
      rejected: outcome.rejected.length,
      sections: outcome.sections,
    });
    revalidatePath('/attendance');
    revalidatePath('/attendance/view');
  }

  return NextResponse.json(
    { date, slot, ...outcome },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
