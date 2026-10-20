import { NextResponse, type NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { currentUser } from '@/lib/authz';
import { resolveTerm, trackReportFor } from '@/lib/tracks';
import { parseReportPart, reportFileName, reportSheets } from '@/lib/track-report';
import { buildXlsx } from '@/lib/xlsx';
import { TrackReportDocument } from '@/lib/pdf-track-report';
import { withRenderSlot } from '@/lib/render-queue';
import { busyResponse, isBusy, pdfResponse } from '@/lib/pdf-response';

export const runtime = 'nodejs';

/**
 * GET /api/track-report?year=&semester=[&part=tracks|rooms|students|ranking][&format=pdf]
 * — the รายงานสรุปการเลือก Track of one ภาคเรียน as an .xlsx, or as a PDF.
 * `part` keeps it to one tab of the page; without it, the whole report.
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
  const pdf = sp.get('format') === 'pdf';

  const report = await trackReportFor(term);
  const sheets = reportSheets(report, part);
  // จัดอันดับข้อย่อย on a ภาคเรียน with no ข้อย่อย has nothing to hand over.
  if (sheets.length === 0) return NextResponse.json({ error: 'nothing to export' }, { status: 404 });

  const name = reportFileName(term, part, pdf ? 'pdf' : 'xlsx');
  const ascii = `Track-${term.year}-${term.semester}${part === 'all' ? '' : `-${part}`}`;

  if (pdf) {
    let buffer: Buffer;
    try {
      // One render at a time across the whole server — see render-queue.ts.
      buffer = await withRenderSlot(() =>
        renderToBuffer(
          <TrackReportDocument
            sheets={sheets}
            termLabel={`ปีการศึกษา ${term.year} ภาคเรียนที่ ${term.semester}`}
          />,
        ),
      );
    } catch (e) {
      if (isBusy(e)) return busyResponse();
      throw e;
    }
    return pdfResponse(buffer, { asciiName: `${ascii}.pdf`, thaiName: name.replace(/\.pdf$/, '') });
  }

  return new NextResponse(new Uint8Array(buildXlsx(sheets)), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // The name is Thai, so it goes in the RFC 5987 form; the ASCII fallback
      // is there for whatever cannot read that one.
      'Content-Disposition': `attachment; filename="${ascii}.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      // Every นักเรียน of the school by name — not something to sit in a cache.
      'Cache-Control': 'private, no-store, must-revalidate',
    },
  });
}
