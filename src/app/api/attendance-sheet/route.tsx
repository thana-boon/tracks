import { NextResponse, type NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { currentUser } from '@/lib/authz';
import { activeYear } from '@/lib/years';
import { listSections, studentsInSection, classDatesOf } from '@/lib/data';
import { AttendanceSheet, type AttendanceSheetSection } from '@/lib/pdf-attendance';

export const runtime = 'nodejs';

/**
 * GET /api/attendance-sheet?sections=<id,id,…>&columns=<n>
 *
 * Blank check-in sheets — one A4 portrait page per รอบเรียน, so a set of rooms
 * prints as a single file. `section=<id>` (singular) is also accepted for links
 * that carry one id.
 */
export async function GET(req: NextRequest) {
  // Admin only — teachers check in on screen and do not print blank sheets.
  const user = await currentUser();
  if (!user || user.role !== 'admin')
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const year = await activeYear();
  if (!year) return NextResponse.json({ error: 'no active year' }, { status: 400 });

  const params = req.nextUrl.searchParams;
  const wanted = new Set(
    [...(params.get('sections') ?? '').split(','), params.get('section') ?? '']
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isInteger(n) && n > 0),
  );
  if (wanted.size === 0) return NextResponse.json({ error: 'bad section' }, { status: 400 });
  const columns = Math.min(16, Math.max(1, Number(params.get('columns')) || 16));

  // Scoped to the active year by listSections, so an id from another year — or
  // a made-up one — simply does not come back.
  const rows = (await listSections(year.id)).filter((s) => wanted.has(s.id));
  if (rows.length === 0) return NextResponse.json({ error: 'section not found' }, { status: 404 });

  const sections: AttendanceSheetSection[] = await Promise.all(
    rows.map(async (section) => {
      const [students, classDates] = await Promise.all([
        studentsInSection(section.id),
        classDatesOf(section.id),
      ]);
      return {
        groupCode: section.groupCode,
        subjectCode: section.subjectCode,
        subjectName: section.subjectName,
        sectionName: section.name,
        teacherName: section.teacherName,
        room: section.room,
        classDates,
        students: students.map((st, i) => ({
          no: i + 1,
          code: st.code,
          fullName: st.fullName,
          gradeLevel: st.gradeLevel,
          classroom: st.classroom,
          classNumber: st.classNumber,
        })),
      };
    }),
  );

  const buffer = await renderToBuffer(
    <AttendanceSheet data={{ yearLabel: `ปีการศึกษา ${year.year}`, sections, columns }} />,
  );

  // Content-Disposition is Latin-1 only; keep an ASCII fallback + UTF-8 name.
  const label = rows.length === 1 ? rows[0].subjectCode : `${rows.length}-รอบ`;
  const asciiLabel = (
    rows.length === 1 ? rows[0].subjectCode : `${rows.length}-sections`
  ).replace(/[^\x20-\x7E]/g, '_');
  const utf8 = encodeURIComponent(`ใบเช็คชื่อ-${label}.pdf`);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="attendance-${asciiLabel}.pdf"; filename*=UTF-8''${utf8}`,
    },
  });
}
