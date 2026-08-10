import { NextResponse, type NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { currentUser } from '@/lib/authz';
import { activeYear } from '@/lib/years';
import { listSections, studentsInSection, classDatesOf } from '@/lib/data';
import { AttendanceSheet, type AttendanceSheetSection } from '@/lib/pdf-attendance';
import { byClassOrder } from '@/lib/utils';
import { withRenderSlot } from '@/lib/render-queue';
import { busyResponse, isBusy, pdfResponse } from '@/lib/pdf-response';

export const runtime = 'nodejs';

/**
 * One page per รอบเรียน, so this is a page ceiling. The screen offers
 * “เลือกที่แสดงทั้งหมด”, and a year's worth of รอบ behind that button is a
 * document nobody wants and a render everybody else waits through — the other
 * two exports have had a ceiling all along and this one had none.
 */
const MAX_SECTIONS = 120;

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
  if (wanted.size > MAX_SECTIONS)
    return NextResponse.json({ error: 'scope too large' }, { status: 400 });
  const columns = Math.min(16, Math.max(1, Number(params.get('columns')) || 16));

  // Scoped to the active year by listSections, so an id from another year — or
  // a made-up one — simply does not come back. Pages come out in ชั้น/กลุ่ม
  // order, the same order the ticks were read in on the print screen.
  const rows = (await listSections(year.id))
    .filter((s) => wanted.has(s.id))
    .sort(byClassOrder);
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

  let buffer: Buffer;
  try {
    // One render at a time across the whole server — see render-queue.ts.
    buffer = await withRenderSlot(() =>
      renderToBuffer(
        <AttendanceSheet data={{ yearLabel: `ปีการศึกษา ${year.year}`, sections, columns }} />,
      ),
    );
  } catch (e) {
    if (isBusy(e)) return busyResponse();
    throw e;
  }

  const label = rows.length === 1 ? rows[0].subjectCode : `${rows.length}-รอบ`;
  const asciiLabel = (
    rows.length === 1 ? rows[0].subjectCode : `${rows.length}-sections`
  ).replace(/[^\x20-\x7E]/g, '_');
  return pdfResponse(buffer, {
    asciiName: `attendance-${asciiLabel}.pdf`,
    thaiName: `ใบเช็คชื่อ-${label}`,
  });
}
