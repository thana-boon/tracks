import { NextResponse, type NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { classroomStudents, people, registrations } from '@/db/schema';
import { getSession } from '@/lib/session';
import { activeYear } from '@/lib/years';
import { buildTranscripts } from '@/lib/transcript';
import { TranscriptDocument } from '@/lib/pdf-transcript';

export const runtime = 'nodejs';

/**
 * GET /api/transcript — one A4 page per student (spec §4.6).
 * Scope (choose one): ?grade=ม.4[&room=1] · ?subject=<id> · ?classroom=<id>
 * Admin only. Year defaults to the active one.
 */
export async function GET(req: NextRequest) {
  const user = await getSession();
  if (!user || user.role !== 'admin')
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const year = await activeYear();
  if (!year) return NextResponse.json({ error: 'no active year' }, { status: 400 });

  const sp = req.nextUrl.searchParams;
  const grade = (sp.get('grade') ?? '').trim();
  const room = (sp.get('room') ?? '').trim();
  const subjectId = Number(sp.get('subject')) || 0;
  const classroomId = Number(sp.get('classroom')) || 0;

  let studentIds: number[] = [];
  let label = '';

  if (subjectId > 0) {
    const rows = await db
      .select({ id: registrations.studentId })
      .from(registrations)
      .where(and(eq(registrations.subjectId, subjectId), eq(registrations.yearId, year.id), isNull(registrations.droppedAt)));
    studentIds = rows.map((r) => r.id);
    label = 'ตามวิชา';
  } else if (classroomId > 0) {
    const rows = await db
      .select({ id: classroomStudents.studentId })
      .from(classroomStudents)
      .where(eq(classroomStudents.classroomId, classroomId));
    studentIds = rows.map((r) => r.id);
    label = 'ตามห้องเรียนพิเศษ';
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
  if (studentIds.length > 600)
    return NextResponse.json({ error: 'scope too large' }, { status: 400 });

  const transcripts = await buildTranscripts(year, studentIds);
  const buffer = await renderToBuffer(
    <TranscriptDocument transcripts={transcripts} yearLabel={`ปีการศึกษา ${year.year}`} />,
  );

  // Content-Disposition is Latin-1 only; the Thai `label` would throw. Give an
  // ASCII fallback filename plus an RFC 5987 filename* carrying the Thai name.
  const utf8 = encodeURIComponent(`ทรานสคริปต์-${label || 'ทั้งหมด'}.pdf`);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="transcript.pdf"; filename*=UTF-8''${utf8}`,
    },
  });
}
