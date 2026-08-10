import { NextResponse, type NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { currentUser } from '@/lib/authz';
import { activeYear } from '@/lib/years';
import { buildHomeroomReport, listHomerooms, studentsByRoom, toRoomMatrix } from '@/lib/homeroom';
import { HomeroomReportDocument } from '@/lib/pdf-homeroom';
import { thaiMonthLabel } from '@/lib/utils';
import { withRenderSlot } from '@/lib/render-queue';
import { busyResponse, isBusy, pdfResponse } from '@/lib/pdf-response';

export const runtime = 'nodejs';

/** Same ceiling the transcript export uses — beyond it, ask for fewer rooms. */
const MAX_STUDENTS = 600;

/**
 * GET /api/homeroom-report?rooms=ม.5/1,ม.5/2[&month=2026-07] — one landscape
 * page per ห้อง: students down the side, class dates across the top. `month`
 * keeps a long year down to columns that fit.
 *
 * An admin may export any ห้อง; a ครูประจำชั้น may export the ones they advise
 * and nothing else. That limit is enforced here rather than in the page: the URL
 * is just a query string, and the export panel that builds it is only the polite
 * way in.
 */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user || (user.role !== 'admin' && user.role !== 'teacher'))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const isAdmin = user.role === 'admin';
  if (!isAdmin && !user.personId)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const year = await activeYear();
  if (!year) return NextResponse.json({ error: 'no active year' }, { status: 400 });

  const asked = (req.nextUrl.searchParams.get('rooms') ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  if (asked.length === 0) return NextResponse.json({ error: 'no rooms' }, { status: 400 });

  // Only rooms that actually exist this year *and* that this reader may see —
  // the key comes from a query string, and for a ครู the list is already narrowed
  // to their own, so another teacher's room simply falls out of the filter.
  const wanted = new Set(asked);
  const rooms = (await listHomerooms(year, isAdmin ? undefined : user.personId!)).filter((r) =>
    wanted.has(r.key),
  );
  if (rooms.length === 0) return NextResponse.json({ error: 'unknown rooms' }, { status: 404 });

  const byRoom = await studentsByRoom(rooms);
  const total = [...byRoom.values()].reduce((n, ids) => n + ids.length, 0);
  if (total === 0) return NextResponse.json({ error: 'no students' }, { status: 404 });
  if (total > MAX_STUDENTS)
    return NextResponse.json({ error: 'scope too large' }, { status: 400 });

  const askedMonth = (req.nextUrl.searchParams.get('month') ?? '').trim();
  const month = /^\d{4}-\d{2}$/.test(askedMonth) ? askedMonth : undefined;

  // One build for every student across the chosen rooms — sections are shared,
  // so evaluating them once beats one build per room.
  const entries = await buildHomeroomReport(year, [...byRoom.values()].flat());
  const entryBy = new Map(entries.map((e) => [e.student.id, e]));

  const matrices = rooms.map((room) =>
    toRoomMatrix(
      room.key,
      room.teacherNames,
      (byRoom.get(room.key) ?? [])
        .map((id) => entryBy.get(id))
        .filter((e): e is NonNullable<typeof e> => Boolean(e)),
      month,
    ),
  );

  let buffer: Buffer;
  try {
    // One render at a time across the whole server — see render-queue.ts.
    buffer = await withRenderSlot(() =>
      renderToBuffer(
        <HomeroomReportDocument
          rooms={matrices}
          yearLabel={`ปีการศึกษา ${year.year}`}
          scopeLabel={month ? thaiMonthLabel(month) : 'ทุกเดือน'}
        />,
      ),
    );
  } catch (e) {
    if (isBusy(e)) return busyResponse();
    throw e;
  }

  const label = rooms.length === 1 ? rooms[0].key : `${rooms.length} ห้อง`;
  const when = month ? `-${thaiMonthLabel(month)}` : '';
  return pdfResponse(buffer, {
    asciiName: 'homeroom-report.pdf',
    thaiName: `รายงานห้องที่ปรึกษา-${label}${when}`,
  });
}
