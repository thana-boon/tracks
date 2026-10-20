import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@/lib/authz';
import { resolveTerm, trackReportFor } from '@/lib/tracks';
import { parseReportPart, reportFileName, reportSheets } from '@/lib/track-report';
import { buildXlsx } from '@/lib/xlsx';

export const runtime = 'nodejs';

/**
 * GET /api/track-report?year=&semester=[&part=tracks|rooms|students|ranking]
 * — the รายงานสรุปการเลือก Track of one ภาคเรียน as an .xlsx. `part` keeps it
 * to one tab of the page; without it, the whole report. The PDF is not made
 * here — see /admin/tracks/report/print.
 *
 * A route rather than a server action because a download is a navigation: the
 * browser saves what it is handed, with no blob to hold in memory and no
 * client code to keep in step with the sheet layout.
 */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user || user.role !== 'admin')
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const term = await resolveTerm(Number(sp.get('year')) || null, Number(sp.get('semester')) || null);
  if (!term) return NextResponse.json({ error: 'no term' }, { status: 404 });

  const part = parseReportPart(sp.get('part'));
  const sheets = reportSheets(await trackReportFor(term), part);
  // จัดอันดับข้อย่อย on a ภาคเรียน with no ข้อย่อย has nothing to hand over.
  if (sheets.length === 0) return NextResponse.json({ error: 'nothing to export' }, { status: 404 });

  const name = reportFileName(term, part, 'xlsx');
  const ascii = `Track-${term.year}-${term.semester}${part === 'all' ? '' : `-${part}`}.xlsx`;

  return new NextResponse(new Uint8Array(buildXlsx(sheets)), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // The name is Thai, so it goes in the RFC 5987 form; the ASCII fallback
      // is there for whatever cannot read that one.
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      // Every นักเรียน of the school by name — not something to sit in a cache.
      'Cache-Control': 'private, no-store, must-revalidate',
    },
  });
}
