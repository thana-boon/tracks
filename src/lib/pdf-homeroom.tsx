import 'server-only';
import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { base, thai, PURPLE, GOLD, LINE, MUTED } from './pdf-base';
import { thaiDateTimeLongOf, THAI_WEEKDAYS_SHORT, weekdayOfYmd } from './utils';
import { DAY_OUTCOME_LABEL } from './evaluate';
import type { MatrixCell, RoomMatrix } from './homeroom';

/**
 * How many date columns fit across one portrait A4 next to the name columns.
 * More than this and the room continues on a second page rather than spilling
 * off the edge.
 */
const DATES_PER_PAGE = 5;

// 18 + 108 + 40 + 5 × 68 = 506pt, inside the 515pt a portrait A4 leaves once
// the margins are taken — five date columns is the widest that fits.
const W = { no: 18, name: 108, nick: 40, code: 32, result: 36 };
const DATE_W = W.code + W.result;
/** Portrait has height to spare, so rows stay legible; a ห้อง still fits one sheet. */
const ROW_H = 12;
/** Tall enough for a rotated "26 ก.ค. 69" to stand in, with slack top and bottom. */
const HEAD_H = 50;
/** Length of the caption's line box — its height on the page once rotated. */
const CAPTION_W = 44;
/** Line box of that caption — its width on the page once rotated. */
const CAPTION_H = 9;
const PAD_TOP = 24;
const PAD_BOTTOM = 28;

const s = StyleSheet.create({
  band: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  school: { fontSize: 8, color: MUTED, lineHeight: 1.2 },
  title: { fontSize: 12, fontWeight: 700, color: PURPLE, marginTop: 1, lineHeight: 1.3 },
  meta: { fontSize: 8, color: MUTED, textAlign: 'right', lineHeight: 1.3 },
  rule: { height: 2, width: 40, backgroundColor: GOLD, marginTop: 4, marginBottom: 6 },

  // Hug the columns instead of stretching: with two or three dates a full-width
  // border would leave a band of empty header running off to the right.
  table: { borderWidth: 1, borderColor: LINE, borderRadius: 3, alignSelf: 'flex-start' },
  head: { flexDirection: 'row', backgroundColor: '#f1edf7', borderBottomWidth: 1, borderColor: LINE },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderColor: LINE, minHeight: ROW_H, alignItems: 'center' },
  rowLast: { borderBottomWidth: 0 },
  rowAlt: { backgroundColor: '#faf8fd' },

  /** the rotated date caption sits in a box this tall */
  headCell: { height: HEAD_H, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 2 },
  // The cell is a column, so `justifyContent: flex-end` already puts the label
  // on the bottom edge — aligning it on the cross axis would shove it right.
  headLabel: { fontSize: 7.5, fontWeight: 600, paddingBottom: 2 },
  headDate: { width: DATE_W, position: 'relative' },
  /**
   * A rotated Text still occupies its *unrotated* box in the layout, so the
   * caption has to be taken out of the flow and centred by hand: lay it out as
   * a HEAD_H-wide line, park it in the middle of the cell, then spin it about
   * that centre. Anything less and it hangs outside the header.
   */
  vertical: {
    position: 'absolute',
    width: CAPTION_W,
    left: (DATE_W - CAPTION_W) / 2,
    top: (HEAD_H - CAPTION_H) / 2,
    height: CAPTION_H,
    fontSize: 7.5,
    fontWeight: 600,
    lineHeight: 1.2,
    textAlign: 'center',
    maxLines: 1,
    transform: 'rotate(-90deg)',
    transformOrigin: 'center center',
  },
  headSub: { flexDirection: 'row', borderTopWidth: 1, borderColor: LINE },
  headSubCell: { fontSize: 6, color: MUTED, textAlign: 'center', paddingVertical: 1 },

  sep: { borderLeftWidth: 1, borderColor: LINE },
  // Every cell is clamped to one line at a fixed lineHeight: Thai glyphs carry
  // tall ascenders, so left to itself a row grows well past ROW_H and pushes
  // the room onto a second sheet.
  cNo: { width: W.no, fontSize: 6.5, textAlign: 'center', color: MUTED, maxLines: 1, lineHeight: 1 },
  cName: { width: W.name, fontSize: 7, paddingLeft: 3, maxLines: 1, textOverflow: 'ellipsis', lineHeight: 1 },
  cNick: { width: W.nick, fontSize: 7, paddingLeft: 3, color: MUTED, maxLines: 1, textOverflow: 'ellipsis', lineHeight: 1 },
  cCode: { width: W.code, fontSize: 6.5, textAlign: 'center', maxLines: 1, lineHeight: 1 },
  cResult: { width: W.result, fontSize: 6.5, textAlign: 'center', fontWeight: 600, maxLines: 1, lineHeight: 1 },

  legend: { marginTop: 4, fontSize: 6.5, color: MUTED, lineHeight: 1.2 },
  empty: { paddingVertical: 14, textAlign: 'center', color: MUTED, fontSize: 9 },
});

const resultColor: Record<string, string> = {
  excellent: '#8a6a00',
  partial: '#16a34a',
  absent: '#dc2626',
};

/** "1 ก.ค. 69" with no leading zero — the caption printed down each column. */
function columnDate(ymd: string): string {
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const [y, m, d] = ymd.split('-').map(Number);
  return `${d} ${months[m - 1]} ${String(y + 543).slice(-2)}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The pair of cells under one date: which วิชา, and how the day went. */
function DayCells({ cells }: { cells: MatrixCell[] | undefined }) {
  if (!cells || cells.length === 0)
    return (
      <>
        <Text style={[s.cCode, s.sep, { color: LINE }]}>–</Text>
        <Text style={[s.cResult, { color: LINE }]}>–</Text>
      </>
    );
  // Two วิชา on one date is rare; stack the codes so the row keeps its shape.
  return (
    <>
      <Text style={[s.cCode, s.sep]}>{cells.map((c) => c.subjectCode).join(' ')}</Text>
      <Text
        style={[
          s.cResult,
          { color: cells[0].result ? resultColor[cells[0].result] : MUTED },
        ]}
      >
        {thai(
          cells
            .map((c) => (c.result ? DAY_OUTCOME_LABEL[c.result] : 'รอประเมิน'))
            .join(' '),
        )}
      </Text>
    </>
  );
}

function RoomPage({
  room,
  dates,
  yearLabel,
  scopeLabel,
  part,
  parts,
}: {
  room: RoomMatrix;
  dates: string[];
  yearLabel: string;
  scopeLabel: string;
  part: number;
  parts: number;
}) {
  return (
    <Page size="A4" style={[base.page, { paddingTop: PAD_TOP, paddingBottom: PAD_BOTTOM }]}>
      <View style={s.band}>
        <View>
          <Text style={s.school}>โรงเรียนสุคนธีรวิทย์</Text>
          <Text style={s.title}>
            {thai(`รายงานวิชาเสริม · ห้อง ${room.key}`)}
            {parts > 1 ? ` (${part}/${parts})` : ''}
          </Text>
        </View>
        <View>
          <Text style={s.meta}>{thai(yearLabel)}</Text>
          <Text style={s.meta}>
            {thai(
              room.teacherNames.length > 0
                ? `ครูที่ปรึกษา ${room.teacherNames.join(', ')} · ${room.rows.length} คน`
                : `${room.rows.length} คน`,
            )}
          </Text>
          <Text style={s.meta}>{thai(scopeLabel)}</Text>
        </View>
      </View>
      <View style={s.rule} />

      {dates.length === 0 ? (
        <View style={s.table}>
          <Text style={s.empty}>ไม่มีวันเรียนวิชาเสริมในช่วงที่เลือก</Text>
        </View>
      ) : (
        <View style={s.table}>
          <View style={s.head} fixed>
            <View style={[s.headCell, { width: W.no }]}>
              <Text style={[s.headLabel, { fontSize: 6.5 }]}>ที่</Text>
            </View>
            <View style={[s.headCell, { width: W.name, alignItems: 'flex-start', paddingLeft: 3 }]}>
              <Text style={s.headLabel}>ชื่อ - สกุล</Text>
            </View>
            <View style={[s.headCell, { width: W.nick, alignItems: 'flex-start', paddingLeft: 3 }]}>
              <Text style={s.headLabel}>ชื่อเล่น</Text>
            </View>
            {dates.map((d) => (
              <View key={d} style={[s.headCell, s.sep, s.headDate]}>
                <Text style={s.vertical}>{thai(columnDate(d))}</Text>
              </View>
            ))}
          </View>

          <View style={s.headSub} fixed>
            <Text style={[s.headSubCell, { width: W.no }]} />
            <Text style={[s.headSubCell, { width: W.name }]} />
            <Text style={[s.headSubCell, { width: W.nick }]} />
            {dates.map((d) => (
              <React.Fragment key={d}>
                <Text style={[s.headSubCell, s.sep, { width: W.code }]}>รหัสวิชา</Text>
                <Text style={[s.headSubCell, { width: W.result }]}>ผล</Text>
              </React.Fragment>
            ))}
          </View>

          {room.rows.map((r, i) => (
            <View
              key={r.student.id}
              style={[s.row, i % 2 === 1 ? s.rowAlt : {}, i === room.rows.length - 1 ? s.rowLast : {}]}
              wrap={false}
            >
              <Text style={s.cNo}>{r.student.classNumber ?? i + 1}</Text>
              <Text style={s.cName}>{thai(r.student.fullName)}</Text>
              <Text style={s.cNick}>{thai(r.student.nickname ?? '')}</Text>
              {dates.map((d) => (
                <React.Fragment key={d}>
                  <DayCells cells={r.byDate.get(d)} />
                </React.Fragment>
              ))}
            </View>
          ))}
        </View>
      )}

      <Text style={s.legend}>
        ยอดเยี่ยม = มาครบทั้งวัน · ผ่าน = มาครึ่งวัน · ไม่ผ่าน = ไม่มาเลย · รอประเมิน = ยังไม่ได้เช็คชื่อ · – = ไม่มีเรียน
      </Text>

      <View style={[base.footer, { bottom: 12, fontSize: 7 }]} fixed>
        <Text>Track · ระบบวิชาเสริม โรงเรียนสุคนธีรวิทย์</Text>
        <Text>ออกเอกสารเมื่อ {thaiDateTimeLongOf(new Date())}</Text>
      </View>
    </Page>
  );
}

/**
 * รายงานห้องที่ปรึกษา — one portrait A4 per ห้อง: students down the side, class
 * dates across the top, each date carrying the รหัสวิชา the student sat and the
 * result of that day. A room with more dates than fit continues on a second
 * page rather than running off the paper.
 */
export function HomeroomReportDocument({
  rooms,
  yearLabel,
  scopeLabel,
}: {
  rooms: RoomMatrix[];
  yearLabel: string;
  /** "ทุกเดือน" or "กรกฎาคม 2569" — which dates the grid covers */
  scopeLabel: string;
}) {
  return (
    <Document>
      {rooms.flatMap((room) => {
        const pages = chunk(room.dates, DATES_PER_PAGE);
        return pages.map((dates, i) => (
          <RoomPage
            key={`${room.key}-${i}`}
            room={room}
            dates={dates}
            yearLabel={yearLabel}
            scopeLabel={scopeLabel}
            part={i + 1}
            parts={pages.length}
          />
        ));
      })}
    </Document>
  );
}
