import { NextResponse, type NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { people } from '@/db/schema';
import { currentUser } from '@/lib/authz';
import { activeYear } from '@/lib/years';
import { buildTranscripts } from '@/lib/transcript';
import { docSettings } from '@/lib/doc-settings';
import { TranscriptDocument } from '@/lib/pdf-transcript';
import { withRenderSlot } from '@/lib/render-queue';
import { busyResponse, isBusy, pdfResponse } from '@/lib/pdf-response';

export const runtime = 'nodejs';

/** Above this the render is slow enough that the browser looks hung. */
const MAX_STUDENTS = 600;

/**
 * GET /api/transcript — one A4 page per student (spec §4.6).
 *
 * Scope, choose one:
 *   ?grade=ม.4[&room=1]   a homeroom, or a whole grade
 *   ?students=1,2,3       hand-picked — reprints and one-off requests
 *
 * Admin only. The active year decides *which students* are printed; the
 * document itself always accumulates every year the student has studied, so a
 * ม.6 sheet carries their ม.4 and ม.5 subjects too.
 */
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user || user.role !== 'admin')
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const year = await activeYear();
  if (!year) return NextResponse.json({ error: 'no active year' }, { status: 400 });

  const sp = req.nextUrl.searchParams;
  const grade = (sp.get('grade') ?? '').trim();
  const room = (sp.get('room') ?? '').trim();
  const picked = [
    ...new Set(
      (sp.get('students') ?? '')
        .split(',')
        .map((v) => Number(v.trim()))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ];

  let studentIds: number[];
  let label: string;

  if (picked.length > 0) {
    studentIds = picked;
    label = 'รายบุคคล';
  } else if (grade) {
    const conds = [eq(people.type, 'student'), eq(people.gradeLevel, grade)];
    if (room) conds.push(eq(people.classroom, room));
    const rows = await db.select({ id: people.id }).from(people).where(and(...conds));
    studentIds = rows.map((r) => r.id);
    label = room ? `${grade}/${room}` : grade;
  } else {
    return NextResponse.json({ error: 'no scope' }, { status: 400 });
  }

  if (studentIds.length === 0)
    return NextResponse.json({ error: 'no students' }, { status: 404 });
  if (studentIds.length > MAX_STUDENTS)
    return NextResponse.json({ error: 'scope too large' }, { status: 400 });

  const [transcripts, settings] = await Promise.all([
    buildTranscripts(studentIds),
    docSettings(),
  ]);
  // `students=` is caller-supplied: ids that are not students of this school
  // simply drop out of the build, and a document of nothing is not a document.
  if (transcripts.length === 0)
    return NextResponse.json({ error: 'no students' }, { status: 404 });

  let buffer: Buffer;
  try {
    // One render at a time across the whole server — see render-queue.ts.
    buffer = await withRenderSlot(() =>
      renderToBuffer(<TranscriptDocument transcripts={transcripts} settings={settings} />),
    );
  } catch (e) {
    if (isBusy(e)) return busyResponse();
    throw e;
  }

  // A single sheet is nearly always a reprint for one student, so name the file
  // after them — that is what makes it findable in the Downloads folder later.
  const only = transcripts.length === 1 ? transcripts[0].student : null;
  const name = only ? `ทรานสคริปต์-${only.code}-${only.fullName}` : `ทรานสคริปต์-${label}`;
  return pdfResponse(buffer, { asciiName: 'transcript.pdf', thaiName: name });
}
