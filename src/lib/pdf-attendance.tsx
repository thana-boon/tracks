import 'server-only';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { base, thai, PURPLE, LINE, MUTED } from './pdf-base';
import { thaiDateTimeLongOf, thaiDateShort } from './utils';

export interface AttendanceSheetSection {
  groupCode: string;
  subjectCode: string;
  subjectName: string;
  /** which cohort — the กลุ่ม name, e.g. "ม.4 กลุ่มเรียนที่ 1" */
  sectionName: string;
  teacherName: string | null;
  room: string | null;
  /** scheduled class dates, "YYYY-MM-DD" ascending */
  classDates: string[];
  students: {
    /** running order on the sheet — the same order the check-in screen lists */
    no: number;
    code: string;
    fullName: string;
    gradeLevel: string | null;
    classroom: string | null;
    /** เลขที่ in the student's own homeroom */
    classNumber: number | null;
  }[];
}

export interface AttendanceSheetData {
  yearLabel: string;
  sections: AttendanceSheetSection[];
  /** how many blank marking columns to rule off */
  columns: number;
}

// A4 portrait is 842pt tall; 84pt goes to page padding, ~78pt to the heading
// block and ~43pt to the signature line. What is left is the roster's budget —
// rows are sized to fill it exactly so a class of any size stays on one sheet.
// Each row also draws a 1pt bottom border, which is why the divisor allows for
// one extra row (the table header) and the row height is a point short.
// The floor keeps names legible; it caps a single sheet at ~85 students, well
// past any real วิชาเสริม room. A roster past that wraps rather than shrinking
// to an unreadable size.
const BODY_HEIGHT = 630;
const MIN_ROW = 7;
const MAX_ROW = 20;

// The marking grid gets this much of the row's width; what is left over goes to
// the name column, which is why the budget stops short of the ~400pt actually
// free — names stay readable at every column count.
const MARK_BUDGET = 290;
const MIN_MARK = 7;
const MAX_MARK = 16;

const s = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  title: { fontSize: 14, fontWeight: 700, color: PURPLE },
  sub: { color: MUTED, fontSize: 8.5, marginTop: 2 },
  rule: { height: 2, width: 36, backgroundColor: '#f5c518', marginVertical: 6 },

  subjectLine: { fontSize: 11, fontWeight: 600, marginBottom: 3 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  meta: { fontSize: 8.5, color: MUTED, marginRight: 14 },
  metaVal: { color: '#1a1625', fontWeight: 600 },

  table: { borderTopWidth: 1, borderLeftWidth: 1, borderColor: LINE },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderColor: LINE, alignItems: 'center' },
  th: { backgroundColor: '#f1edf7' },
  cell: { borderRightWidth: 1, borderColor: LINE, height: '100%', justifyContent: 'center' },
  cNo: { width: 22, alignItems: 'center' },
  cCode: { width: 40, paddingLeft: 3 },
  cNum: { width: 20, alignItems: 'center' },
  cName: { flex: 1, paddingLeft: 4 },
  cRoom: { width: 30, alignItems: 'center' },

  headText: { fontWeight: 600 },
  markHead: { color: MUTED, textAlign: 'center' },

  sign: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  signBox: { width: 190, alignItems: 'center' },
  signLine: { borderBottomWidth: 1, borderColor: LINE, width: '100%', height: 18 },
  signLabel: { fontSize: 8, color: MUTED, marginTop: 3 },
});

/**
 * ใบเช็คชื่อ — one A4 portrait page per กลุ่มเรียน, several to a file so a whole
 * set of rooms can be printed in one go.
 *
 * Row height is derived from the roster size rather than fixed: a class of 15
 * gets comfortable rows, a class of 60 gets tight ones, and either way the
 * sheet stays on a single page.
 */
export function AttendanceSheet({ data }: { data: AttendanceSheetData }) {
  return (
    <Document>
      {data.sections.map((section, i) => (
        <SectionPage
          key={i}
          section={section}
          yearLabel={data.yearLabel}
          columns={data.columns}
        />
      ))}
    </Document>
  );
}

function SectionPage({
  section,
  yearLabel,
  columns,
}: {
  section: AttendanceSheetSection;
  yearLabel: string;
  columns: number;
}) {
  const rows = Math.max(section.students.length, 1);
  const rowH = Math.min(MAX_ROW, Math.max(MIN_ROW, BODY_HEIGHT / (rows + 1) - 1));
  const font = rowH >= 17 ? 9 : rowH >= 14 ? 8 : rowH >= 11 ? 7 : 6;

  // The marking area is a plain ruled grid, the way a paper ใบรายชื่อ is: a run
  // of narrow blank cells the teacher writes the date over and ticks by hand.
  // Columns share MARK_BUDGET, so asking for more of them narrows each one
  // rather than eating into the names.
  const cols = Math.max(1, Math.min(60, Math.trunc(columns)));
  const markWidth = Math.min(MAX_MARK, Math.max(MIN_MARK, Math.floor(MARK_BUDGET / cols)));
  // The column number sits in the header as a counting guide; shrink it when the
  // columns get narrow so two digits still fit inside the cell.
  const markFont = Math.max(4, Math.min(font - 1, (markWidth - 2) / 1.3));

  return (
    <Page size="A4" orientation="portrait" style={base.page}>
      <View style={s.header}>
        <View>
          <Text style={s.title}>ใบเช็คชื่อวิชาเสริม</Text>
          <Text style={s.sub}>โรงเรียนสุคนธีรวิทย์ · {thai(yearLabel)}</Text>
        </View>
        <Text style={s.sub}>รวม {section.students.length} คน</Text>
      </View>
      <View style={s.rule} />

      <Text style={s.subjectLine}>
        {thai(`${section.groupCode} · ${section.subjectCode} — ${section.subjectName}`)}
      </Text>
      <View style={s.metaRow}>
        <Text style={s.meta}>
          กลุ่ม: <Text style={s.metaVal}>{thai(section.sectionName)}</Text>
        </Text>
        <Text style={s.meta}>
          ห้องเรียน: <Text style={s.metaVal}>{thai(section.room ?? '—')}</Text>
        </Text>
        {section.teacherName ? (
          <Text style={s.meta}>
            ครูผู้สอน: <Text style={s.metaVal}>{thai(section.teacherName)}</Text>
          </Text>
        ) : null}
        <Text style={s.meta}>
          วันเรียน:{' '}
          <Text style={s.metaVal}>
            {section.classDates.length > 0
              ? thai(section.classDates.map((d) => thaiDateShort(d)).join(', '))
              : '—'}
          </Text>
        </Text>
      </View>

      <View style={s.table}>
        <View style={[s.tr, s.th, { height: rowH + 4 }]}>
          <View style={[s.cell, s.cNo]}>
            <Text style={[s.headText, { fontSize: font }]}>ที่</Text>
          </View>
          <View style={[s.cell, s.cCode]}>
            <Text style={[s.headText, { fontSize: font }]}>รหัส</Text>
          </View>
          <View style={[s.cell, s.cNum]}>
            <Text style={[s.headText, { fontSize: font - 1 }]}>เลขที่</Text>
          </View>
          <View style={[s.cell, s.cName]}>
            <Text style={[s.headText, { fontSize: font }]}>ชื่อ - สกุล</Text>
          </View>
          <View style={[s.cell, s.cRoom]}>
            <Text style={[s.headText, { fontSize: font - 1 }]}>ชั้น</Text>
          </View>
          {Array.from({ length: cols }, (_, i) => (
            <View key={i} style={[s.cell, { width: markWidth }]}>
              <Text style={[s.markHead, { fontSize: markFont }]}>{i + 1}</Text>
            </View>
          ))}
        </View>

        {section.students.map((st) => (
          <View key={st.code} style={[s.tr, { height: rowH }]} wrap={false}>
            <View style={[s.cell, s.cNo]}>
              <Text style={{ fontSize: font }}>{st.no}</Text>
            </View>
            <View style={[s.cell, s.cCode]}>
              <Text style={{ fontSize: font }}>{st.code}</Text>
            </View>
            <View style={[s.cell, s.cNum]}>
              <Text style={{ fontSize: font }}>{st.classNumber ?? ''}</Text>
            </View>
            <View style={[s.cell, s.cName]}>
              <Text style={{ fontSize: font }}>{thai(st.fullName)}</Text>
            </View>
            <View style={[s.cell, s.cRoom]}>
              <Text style={{ fontSize: font - 1 }}>
                {st.gradeLevel ?? ''}/{st.classroom ?? ''}
              </Text>
            </View>
            {/* the grid itself — cell borders are the box, nothing printed inside */}
            {Array.from({ length: cols }, (_, i) => (
              <View key={i} style={[s.cell, { width: markWidth }]} />
            ))}
          </View>
        ))}
      </View>

      <View style={s.sign}>
        <View style={s.signBox}>
          <View style={s.signLine} />
          <Text style={s.signLabel}>ลงชื่อครูผู้สอน</Text>
        </View>
      </View>

      <View style={base.footer} fixed>
        <Text>Track · ระบบวิชาเสริม</Text>
        <Text>พิมพ์เมื่อ {thaiDateTimeLongOf(new Date())}</Text>
      </View>
    </Page>
  );
}
