import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@/lib/authz';
import { buildXlsx } from '@/lib/xlsx';

export const runtime = 'nodejs';

const cell = z.union([z.string().max(500), z.number(), z.null()]);
const body = z.object({
  fileName: z.string().min(1).max(120),
  sheets: z
    .array(
      z.object({
        name: z.string().max(100),
        header: z.array(z.string().max(200)).max(60),
        rows: z.array(z.array(cell).max(60)).max(5000),
        widths: z.array(z.number().min(1).max(100)).max(60).optional(),
      }),
    )
    .min(1)
    .max(10),
});

/**
 * POST /api/score-ranking — the จัดอันดับคะแนนสอบ on the screen as an .xlsx.
 *
 * The sheets come from the browser rather than being worked out again here:
 * the order depends on which ช่วงสอบ and วิชา the ผู้ดูแล has ticked, that
 * lives only on the page, and doing the sum twice would give the two copies a
 * chance to disagree. This route only turns rows into a workbook — the
 * builder needs Node's deflate, which is the one thing the page cannot do.
 */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user || user.role !== 'admin')
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });

  const { fileName, sheets } = parsed.data;
  const name = `${fileName.replace(/[\\/:*?"<>|]/g, ' ').trim()}.xlsx`;
  return new NextResponse(new Uint8Array(buildXlsx(sheets)), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="score-ranking.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      // Every นักเรียน's score by name — not something to sit in a cache.
      'Cache-Control': 'private, no-store, must-revalidate',
    },
  });
}
