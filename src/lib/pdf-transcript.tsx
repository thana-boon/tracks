import 'server-only';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { DOC_FONT_FAMILY, fitFontSize, thai } from './pdf-base';
import { thaiDateLongOf } from './utils';
import { OVERALL_LABEL } from './evaluate';
import type { DocSettings } from './doc-settings';
import type { StudentTranscript, TranscriptGroup, TranscriptLine } from './transcript';

/**
 * ทรานสคริปต์วิชาเสริม — one A4 page per student, always exactly one.
 *
 * The page is a fixed frame (หัวกระดาษ, ประวัตินักเรียน, ช่องลงนาม) around a
 * table whose height is the only thing that varies, so fitting three years of
 * accumulated subjects onto one sheet is a matter of choosing a row height the
 * table budget can absorb — see `density`, which is the whole of the one-page
 * guarantee.
 *
 * Note that `wrap={false}` is *not* the way to enforce it: @react-pdf reads it
 * as "size this page to its content" and emits a MediaBox the height of the
 * table, so a short transcript prints on a stub of paper rather than on A4.
 */

/**
 * ขาว-ดำ. This is a document that gets signed, stamped, photocopied and filed,
 * and it is printed on whatever mono laser the office has — where the house
 * purple and gold arrive as two indistinguishable muddy greys. So the
 * transcript keeps its own palette instead of the brand one the screens and the
 * working reports (ใบเช็คชื่อ, รายงานห้องที่ปรึกษา) share.
 *
 * The greys are chosen to survive a photocopy: fills stay light enough not to
 * fill in, rules stay dark enough not to drop out.
 */
const INK = '#111111';
const SUBTLE = '#4f4f4f';
const RULE = '#000000';
const BORDER = '#8c8c8c';
const HEAD_BG = '#dedede';
const BAND_BG = '#efefef';

const s = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingBottom: 34,
    paddingHorizontal: 40,
    fontFamily: DOC_FONT_FAMILY,
    fontSize: 10,
    color: INK,
  },

  // ── หัวกระดาษ ──
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 46, height: 46, objectFit: 'contain' },
  headText: { flex: 1, alignItems: 'center' },
  school: { fontSize: 13, fontWeight: 700 },
  title: { fontSize: 15, fontWeight: 700, marginTop: 3 },
  subtitle: { fontSize: 9, color: SUBTLE, marginTop: 2 },
  /** balances the logo so the title stays centred on the sheet, not on the gap */
  headSpacer: { width: 46 },
  rule: { height: 1.6, backgroundColor: RULE, marginTop: 9, marginBottom: 11 },

  // ── ประวัตินักเรียน ──
  info: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  infoItem: { flexDirection: 'row', alignItems: 'baseline', paddingVertical: 2 },
  /** ชื่อ - สกุล gets its own line: a long Thai name wraps, and sharing a row
   *  with รหัสประจำตัว would drag that field out of line with the one below. */
  infoWide: { width: '100%' },
  infoHalf: { width: '46%' },
  infoQuarter: { width: '27%' },
  infoLabel: { width: 112, fontSize: 9, color: SUBTLE },
  /** the two short fields share a row — a 112pt label would crowd out its value */
  infoLabelSm: { width: 58, fontSize: 9, color: SUBTLE },
  infoVal: { flex: 1, fontSize: 10, fontWeight: 600 },

  // ── ตารางผลการเรียน ──
  tableRow: { marginTop: 11, flexDirection: 'row', gap: 12 },
  table: { flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 4 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderColor: BORDER, alignItems: 'center' },
  trLast: { borderBottomWidth: 0 },
  th: { backgroundColor: HEAD_BG, fontWeight: 700 },
  band: {
    backgroundColor: BAND_BG,
    borderBottomWidth: 1,
    borderColor: BORDER,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bandText: { fontWeight: 700, textAlign: 'center' },

  // One column across the page: room for the longest ชื่อวิชา without wrapping.
  cNo: { width: 24, textAlign: 'center' },
  cCode: { width: 66, paddingLeft: 5 },
  cName: { flex: 1, paddingLeft: 5 },
  cYear: { width: 62, textAlign: 'center' },
  cResult: { width: 74, textAlign: 'center', fontWeight: 600 },

  // Side by side: every fixed column is pared back to what its content actually
  // measures in Sarabun at 9.5pt — "ยอดเยี่ยม" 36pt, "PRE110" 30pt, a 2-digit
  // year 11pt — so all the slack goes to ชื่อวิชา, which is the column that
  // decides whether the longest subject name has to be shrunk to fit.
  nNo: { width: 14, textAlign: 'center' },
  nCode: { width: 36, paddingLeft: 2 },
  nName: { flex: 1, paddingLeft: 3, paddingRight: 2 },
  nYear: { width: 24, textAlign: 'center' },
  nResult: { width: 42, textAlign: 'center', fontWeight: 600 },

  empty: { padding: 18, textAlign: 'center', color: SUBTLE, fontSize: 9.5 },
  summary: { marginTop: 7, fontSize: 9, color: SUBTLE, textAlign: 'right' },

  // ── ช่องลงนาม ──
  signRow: { marginTop: 'auto', paddingTop: 18, flexDirection: 'row', justifyContent: 'space-around' },
  signBox: { width: 210, alignItems: 'center' },
  signArea: { height: 38, justifyContent: 'flex-end', alignItems: 'center' },
  signImg: { height: 36, objectFit: 'contain' },
  signLine: { borderTopWidth: 1, borderColor: '#3a3a3a', width: '82%', marginTop: 2, marginBottom: 4 },
  signName: { fontSize: 9.5, fontWeight: 600 },
  signTitle: { fontSize: 9, color: SUBTLE, marginTop: 1 },
  issued: { marginTop: 14, fontSize: 8.5, color: SUBTLE, textAlign: 'center' },
});

/**
 * ยอดเยี่ยม vs ผ่าน used to be told apart by colour. On a mono print that
 * distinction would vanish, so weight carries it instead: the higher result is
 * the heavier one, and both stay black.
 */
const resultWeight: Record<string, 400 | 700> = {
  excellent: 700,
  pass: 400,
};

/** A drawn table row: a กลุ่มวิชา band, or one วิชา. */
type Row =
  | { kind: 'band'; code: string; name: string; continued: boolean }
  | { kind: 'line'; no: number; line: TranscriptLine };

/** Groups flattened into the rows the table draws, numbered 1..N throughout. */
function flatten(groups: TranscriptGroup[]): Row[] {
  const rows: Row[] = [];
  let no = 0;
  for (const g of groups) {
    rows.push({ kind: 'band', code: g.code, name: g.name, continued: false });
    for (const line of g.lines) rows.push({ kind: 'line', no: (no += 1), line });
  }
  return rows;
}

/**
 * The most rows a single column may hold — the last `density` tier that still
 * sets 8.5pt. Past it one column would have to drop to 7.5pt, which is where
 * Thai vowel marks start closing up in print, so the table splits into two
 * columns instead and goes back up to 9.5-10pt. A ม.6 leaver with three years
 * of accumulated subjects lands well past this, and two columns is also how
 * ปพ.1 lays out a Thai transcript.
 */
const SINGLE_COLUMN_MAX = 33;

/**
 * Split rows into two balanced columns. A กลุ่มวิชา cut by the split has its
 * band repeated at the top of the second column marked "(ต่อ)", so no วิชา is
 * ever left sitting under no heading at all.
 */
function splitColumns(rows: Row[]): [Row[], Row[]] {
  let cut = Math.ceil(rows.length / 2);
  // Never end a column on a band — a heading with nothing under it reads as a
  // group the student took no subjects in.
  while (cut > 1 && rows[cut - 1].kind === 'band') cut -= 1;

  const left = rows.slice(0, cut);
  const right = rows.slice(cut);
  if (right[0]?.kind === 'line') {
    for (let i = cut - 1; i >= 0; i -= 1) {
      const r = rows[i];
      if (r.kind === 'band') {
        right.unshift({ ...r, continued: true });
        break;
      }
    }
  }
  return [left, right];
}

/**
 * Row height and type size for the tallest column. The table has roughly 500pt
 * of height to spend; each tier keeps rows × rowH inside that, with enough
 * slack left over to absorb the occasional ชื่อวิชา that wraps to two lines.
 */
function density(rowsPerColumn: number) {
  if (rowsPerColumn <= 20) return { rowH: 21, font: 10, band: 19 };
  if (rowsPerColumn <= 24) return { rowH: 17.5, font: 9.5, band: 16 };
  if (rowsPerColumn <= 28) return { rowH: 15, font: 9, band: 14 };
  if (rowsPerColumn <= 33) return { rowH: 12.5, font: 8.5, band: 12 };
  if (rowsPerColumn <= 40) return { rowH: 10.5, font: 7.5, band: 10 };
  return { rowH: 8.4, font: 6.8, band: 8.2 };
}

function SignBox({
  signature,
  name,
  title,
}: {
  signature: string | null;
  name: string | null;
  title: string;
}) {
  return (
    <View style={s.signBox}>
      <View style={s.signArea}>
        {signature ? <Image style={s.signImg} src={signature} /> : null}
      </View>
      <View style={s.signLine} />
      {/* With no name configured the document still prints the parentheses, so
          the signer can be written in by hand on the sheet itself. */}
      <Text style={s.signName}>{name ? thai(`( ${name} )`) : '(                    )'}</Text>
      <Text style={s.signTitle}>{thai(title)}</Text>
    </View>
  );
}

type Density = ReturnType<typeof density>;

/**
 * Points left for ชื่อวิชา once the fixed columns and the cell padding are
 * taken out of the table width. A4 less the page's 40pt margins is 515.28;
 * two columns also give up the 12pt gutter between them.
 */
const NAME_WIDTH = {
  wide: 515.28 - (24 + 66 + 62 + 74) - 7,
  narrow: (515.28 - 12) / 2 - (14 + 36 + 24 + 42) - 7,
} as const;

/** The column widths in play, chosen by whether the table is split in two. */
function cols(narrow: boolean) {
  return narrow
    ? { no: s.nNo, code: s.nCode, name: s.nName, year: s.nYear, result: s.nResult }
    : { no: s.cNo, code: s.cCode, name: s.cName, year: s.cYear, result: s.cResult };
}

function TableHead({ d, narrow }: { d: Density; narrow: boolean }) {
  const c = cols(narrow);
  const cell = { fontSize: d.font };
  return (
    <View style={[s.tr, s.th, { minHeight: d.rowH + 2 }]}>
      <Text style={[c.no, cell]}>ที่</Text>
      <Text style={[c.code, cell]}>รหัสวิชา</Text>
      <Text style={[c.name, cell]}>ชื่อวิชา</Text>
      <Text style={[c.year, cell]}>{narrow ? 'ปี' : 'ปีการศึกษา'}</Text>
      <Text style={[c.result, cell]}>{narrow ? 'ผล' : 'ผลการเรียน'}</Text>
    </View>
  );
}

function Column({
  rows,
  d,
  narrow,
  nameFont,
}: {
  rows: Row[];
  d: Density;
  narrow: boolean;
  nameFont: number;
}) {
  const c = cols(narrow);
  const cell = { fontSize: d.font };
  const nameCell = { fontSize: nameFont };
  return (
    <View style={s.table}>
      <TableHead d={d} narrow={narrow} />
      {rows.map((r, i) => {
        const last = i === rows.length - 1 ? s.trLast : {};
        if (r.kind === 'band')
          return (
            <View key={`b${i}`} style={[s.band, { minHeight: d.band }, last]}>
              <Text style={[s.bandText, { fontSize: d.font }]}>
                {thai(
                  (r.code === r.name ? r.code : `${r.code} — ${r.name}`) +
                    (r.continued ? ' (ต่อ)' : ''),
                )}
              </Text>
            </View>
          );
        const l = r.line;
        return (
          <View key={`l${i}`} style={[s.tr, { minHeight: d.rowH }, last]}>
            <Text style={[c.no, cell]}>{r.no}</Text>
            <Text style={[c.code, cell]}>{l.subjectCode}</Text>
            <Text style={[c.name, nameCell]}>{thai(l.subjectName)}</Text>
            <Text style={[c.year, cell]}>{narrow ? l.year.slice(-2) : l.year}</Text>
            <Text style={[c.result, cell, { fontWeight: resultWeight[l.overall] }]}>
              {OVERALL_LABEL[l.overall]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function StudentPage({ t, settings }: { t: StudentTranscript; settings: DocSettings }) {
  const { student, groups } = t;

  // One column while it can still be set at a readable size; two beyond that.
  const rows = flatten(groups);
  const narrow = rows.length > SINGLE_COLUMN_MAX;
  const columns = narrow ? splitColumns(rows) : [rows];
  const d = density(Math.max(...columns.map((c) => c.length)));

  // Set every ชื่อวิชา at one size — the largest that keeps the longest of them
  // on a single line, so rows stay the height the one-page fit assumes.
  const nameFont = fitFontSize(
    groups.flatMap((g) => g.lines.map((l) => thai(l.subjectName))),
    narrow ? NAME_WIDTH.narrow : NAME_WIDTH.wide,
    d.font,
    Math.max(6, d.font - 2.5),
  );
  const yearSpan =
    t.years.length === 0
      ? '—'
      : t.years.length === 1
        ? t.years[0]
        : `${t.years[0]} - ${t.years[t.years.length - 1]}`;

  return (
    <Page size="A4" style={s.page}>
      <View style={s.head}>
        {settings.logo ? <Image style={s.logo} src={settings.logo} /> : <View style={s.headSpacer} />}
        <View style={s.headText}>
          <Text style={s.school}>{thai(settings.schoolName)}</Text>
          <Text style={s.title}>{thai(settings.documentTitle)}</Text>
          {settings.documentSubtitle ? (
            <Text style={s.subtitle}>{thai(settings.documentSubtitle)}</Text>
          ) : null}
        </View>
        <View style={s.headSpacer} />
      </View>
      <View style={s.rule} />

      <View style={s.info}>
        <View style={[s.infoItem, s.infoWide]}>
          <Text style={s.infoLabel}>{thai('ชื่อ - สกุล')}</Text>
          <Text style={s.infoVal}>{thai(student.fullName)}</Text>
        </View>
        <View style={[s.infoItem, s.infoHalf]}>
          <Text style={s.infoLabel}>{thai('รหัสประจำตัวนักเรียน')}</Text>
          <Text style={s.infoVal}>{student.code}</Text>
        </View>
        <View style={[s.infoItem, s.infoQuarter]}>
          <Text style={s.infoLabelSm}>{thai('ระดับชั้น')}</Text>
          <Text style={s.infoVal}>
            {thai(`${student.gradeLevel ?? '-'}/${student.classroom ?? '-'}`)}
          </Text>
        </View>
        <View style={[s.infoItem, s.infoQuarter]}>
          <Text style={s.infoLabelSm}>{thai('ปีการศึกษา')}</Text>
          <Text style={s.infoVal}>{yearSpan}</Text>
        </View>
      </View>

      {groups.length === 0 ? (
        <View style={[s.tableRow]}>
          <View style={s.table}>
            <TableHead d={d} narrow={false} />
            <Text style={s.empty}>ยังไม่มีวิชาเสริมที่ผ่านเกณฑ์การประเมิน</Text>
          </View>
        </View>
      ) : (
        <View style={s.tableRow}>
          {columns.map((rows, i) => (
            <Column key={i} rows={rows} d={d} narrow={narrow} nameFont={nameFont} />
          ))}
        </View>
      )}

      {t.passedCount > 0 ? (
        <Text style={s.summary}>
          รวมวิชาเสริมที่ผ่านเกณฑ์ {t.passedCount} วิชา · {groups.length} กลุ่มวิชา
        </Text>
      ) : null}

      <View style={s.signRow}>
        <SignBox
          signature={settings.registrarSignature}
          name={settings.registrarName}
          title={settings.registrarTitle}
        />
        <SignBox
          signature={settings.directorSignature}
          name={settings.directorName}
          title={settings.directorTitle}
        />
      </View>
      <Text style={s.issued}>ออกให้ ณ วันที่ {thaiDateLongOf(new Date())}</Text>
    </Page>
  );
}

export function TranscriptDocument({
  transcripts,
  settings,
}: {
  transcripts: StudentTranscript[];
  settings: DocSettings;
}) {
  return (
    <Document>
      {transcripts.map((t) => (
        <StudentPage key={t.student.id} t={t} settings={settings} />
      ))}
    </Document>
  );
}
