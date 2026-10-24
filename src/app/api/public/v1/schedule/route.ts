import { NextResponse, type NextRequest } from 'next/server';
import { apiError, requireApiKey } from '@/lib/api-keys';
import { scheduleOf } from '@/lib/attendance-api';
import { normalizeYmd, todayYmd } from '@/lib/utils';
import { activeYear } from '@/lib/years';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/public/v1/schedule?date=YYYY-MM-DD — is there วิชาเสริม on this day,
 * and who sits in it.
 *
 * `date` defaults to today in school time. `hasClasses` is the one-line
 * answer; `sections` is every รอบเรียน meeting that day with its นักเรียน, and
 * what is already recorded for each of them, so the other system can show the
 * same list a ครู sees on the เช็คชื่อ screen.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiKey(req);
  if (auth.response) return auth.response;

  const raw = req.nextUrl.searchParams.get('date');
  const date = raw ? normalizeYmd(raw) : todayYmd();
  if (!date) return apiError(400, 'bad_date', 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD');

  const year = await activeYear();
  if (!year) return apiError(503, 'no_active_year', 'ระบบยังไม่ได้ซิงก์ปีการศึกษา');

  const sections = await scheduleOf(year, date);
  return NextResponse.json(
    { date, year: year.year, hasClasses: sections.length > 0, sections },
    // Names and attendance of นักเรียน — never for a shared cache.
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
