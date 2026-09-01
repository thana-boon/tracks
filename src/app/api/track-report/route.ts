import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@/lib/authz';
import { resolveTerm, trackReportFor } from '@/lib/tracks';
import { reportFileName, reportSheets } from '@/lib/track-report';
import { buildXlsx } from '@/lib/xlsx';

export const runtime = 'nodejs';

/**
 * GET /api/track-report?year=&semester= — the รายงานสรุปการเลือก Track of one
 * ภาคเรียน as an .xlsx.
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

  const report = await trackReportFor(term);
  const file = buildXlsx(reportSheets(report));
  const name = reportFileName(term);

  return new NextResponse(new Uint8Array(file), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // The name is Thai, so it goes in the RFC 5987 form; the ASCII fallback
      // is there for whatever cannot read that one.
      'Content-Disposition': `attachment; filename="Track-${term.year}-${term.semester}.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      // Every นักเรียน of the school by name — not something to sit in a cache.
      'Cache-Control': 'private, no-store, must-revalidate',
    },
  });
}
