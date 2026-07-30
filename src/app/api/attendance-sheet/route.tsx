import { NextResponse, type NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { trackGroups, trackSubjects } from '@/db/schema';
import { getSession } from '@/lib/session';
import { activeYear } from '@/lib/years';
import { studentsInSubject, meetingDaysOf } from '@/lib/data';
import { AttendanceSheet } from '@/lib/pdf-attendance';

export const runtime = 'nodejs';

/** GET /api/attendance-sheet?subject=<id>&columns=<n> — blank check-in sheet PDF. */
export async function GET(req: NextRequest) {
  const user = await getSession();
  if (!user || (user.role !== 'admin' && user.role !== 'teacher'))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const year = await activeYear();
  if (!year) return NextResponse.json({ error: 'no active year' }, { status: 400 });

  const subjectId = Number(req.nextUrl.searchParams.get('subject'));
  if (!Number.isInteger(subjectId) || subjectId <= 0)
    return NextResponse.json({ error: 'bad subject' }, { status: 400 });
  const columns = Math.min(30, Math.max(1, Number(req.nextUrl.searchParams.get('columns')) || 16));

  const [subject] = await db
    .select({
      code: trackSubjects.code,
      name: trackSubjects.name,
      teacherName: trackSubjects.teacherName,
      groupCode: trackGroups.code,
    })
    .from(trackSubjects)
    .innerJoin(trackGroups, eq(trackSubjects.groupId, trackGroups.id))
    .where(eq(trackSubjects.id, subjectId))
    .limit(1);
  if (!subject) return NextResponse.json({ error: 'subject not found' }, { status: 404 });

  const [students, meetingDays] = await Promise.all([
    studentsInSubject(subjectId, year.id),
    meetingDaysOf(subjectId, year.id),
  ]);

  const buffer = await renderToBuffer(
    <AttendanceSheet
      data={{
        yearLabel: `ปีการศึกษา ${year.year}`,
        groupCode: subject.groupCode,
        subjectCode: subject.code,
        subjectName: subject.name,
        teacherName: subject.teacherName,
        meetingDays,
        columns,
        students: students.map((st, i) => ({
          no: i + 1,
          code: st.code,
          fullName: st.fullName,
          gradeLevel: st.gradeLevel,
          classroom: st.classroom,
        })),
      }}
    />,
  );

  // Content-Disposition is Latin-1 only; keep an ASCII fallback + UTF-8 name.
  const asciiCode = subject.code.replace(/[^\x20-\x7E]/g, '_');
  const utf8 = encodeURIComponent(`ใบเช็คชื่อ-${subject.code}.pdf`);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="attendance-${asciiCode}.pdf"; filename*=UTF-8''${utf8}`,
    },
  });
}
