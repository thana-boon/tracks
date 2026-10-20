import 'server-only';
import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import {
  base,
  fitFontSize,
  thai,
  textWidth,
  DOC_FONT_FAMILY,
  PURPLE,
  GOLD,
  LINE,
  MUTED,
} from './pdf-base';
import type { Cell, Sheet } from './xlsx';

/**
 * รายงานสรุปการเลือก Track as a PDF — the very sheets the .xlsx is made of,
 * one landscape section per sheet, so the two downloads can never disagree.
 *
 * Columns are as wide as what is in them, so a short เลขที่ never takes room a
 * ชื่อ-สกุล needs. Every cell stays on one line — Thai wrapped by @react-pdf
 * leaves a gap under each row and a stray "-" at the break — so a value that
 * still does not fit is set smaller, that cell alone: one long name should not
 * shrink every name on the page.
 */
const PAGE_W = 841.89;
const PAD_X = 28;
const TABLE_W = PAGE_W - PAD_X * 2;
const CELL_PAD = 3;
const BASE_SIZE = 9;
const MIN_SIZE = 5;
/** Semibold strokes run wider than the regular face textWidth measures. */
const BOLD = 1.08;
/** Every row is this tall whatever its columns' sizes, so the borders line up. */
const ROW_H = BASE_SIZE * 1.25 + 5;

const s = StyleSheet.create({
  page: {
    ...base.page,
    fontFamily: DOC_FONT_FAMILY,
    paddingTop: 26,
    paddingBottom: 36,
    paddingHorizontal: PAD_X,
    fontSize: BASE_SIZE,
  },
  band: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  school: { fontSize: 8, color: MUTED, lineHeight: 1.2 },
  title: { fontSize: 12, fontWeight: 700, color: PURPLE, marginTop: 1, lineHeight: 1.3 },
  meta: { fontSize: 8, color: MUTED, textAlign: 'right', lineHeight: 1.3 },
  rule: { height: 2, width: 40, backgroundColor: GOLD, marginTop: 4, marginBottom: 8 },

  table: { borderWidth: 1, borderColor: LINE },
  head: { flexDirection: 'row', backgroundColor: '#f1edf7', borderBottomWidth: 1, borderColor: LINE },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderColor: LINE, height: ROW_H },
  rowAlt: { backgroundColor: '#faf8fd' },
  gap: { height: 8, borderBottomWidth: 1, borderColor: LINE },
  // A View around each Text so a column set smaller still sits mid-row.
  cell: { justifyContent: 'center', paddingHorizontal: CELL_PAD },
  headCell: { minHeight: ROW_H, paddingVertical: 2 },
  text: { lineHeight: 1.2, maxLines: 1 },
  headText: { fontWeight: 600 },
  num: { textAlign: 'right' },
  sep: { borderLeftWidth: 1, borderColor: LINE },
  empty: { padding: 10, color: MUTED, textAlign: 'center' },
});

function text(v: Cell): string {
  if (v === null || v === undefined) return '';
  return typeof v === 'number' ? v.toLocaleString('th-TH') : v;
}

/**
 * Column widths: each column's widest value at full size, then — when they do
 * not all fit across the page — the narrow ones keep theirs and the wide ones
 * split what is left evenly. Any slack is shared out in proportion.
 */
function widthsOf(sheet: Sheet): number[] {
  const need = sheet.header.map(
    (h, i) =>
      Math.max(
        textWidth(thai(h), BASE_SIZE - 0.5) * BOLD,
        ...sheet.rows.map((r) => textWidth(thai(text(r[i])), BASE_SIZE)),
      ) +
      CELL_PAD * 2 +
      2,
  );
  const total = need.reduce((a, b) => a + b, 0);
  if (total <= TABLE_W) return need.map((w) => (w / total) * TABLE_W);

  const out = [...need];
  let open = need.map((_, i) => i);
  let left = TABLE_W;
  for (;;) {
    const share = left / open.length;
    const fits = open.filter((i) => need[i] <= share);
    if (fits.length === 0) {
      for (const i of open) out[i] = share;
      return out;
    }
    for (const i of fits) left -= need[i];
    open = open.filter((i) => need[i] > share);
    if (open.length === 0) return out.map((w) => (w / (TABLE_W - left)) * TABLE_W);
  }
}

/** The size `value` fits its column at — full size unless it cannot. */
function sizeIn(value: string, width: number, base: number, bold = 1): number {
  return fitFontSize([value], (width - CELL_PAD * 2 - 2) / bold, base, MIN_SIZE);
}

function SheetPage({ sheet, termLabel }: { sheet: Sheet; termLabel: string }) {
  const widths = widthsOf(sheet);
  return (
    <Page size="A4" orientation="landscape" style={s.page} wrap>
      <View style={s.band}>
        <View>
          <Text style={s.school}>โรงเรียนสุคนธีรวิทย์</Text>
          <Text style={s.title}>รายงานสรุปการเลือก Track — {thai(sheet.name)}</Text>
        </View>
        <Text style={s.meta}>{termLabel}</Text>
      </View>
      <View style={s.rule} />

      <View style={s.table}>
        {/* Repeated at the top of every page the sheet runs onto. */}
        <View style={s.head} fixed>
          {sheet.header.map((h, i) => (
            <View key={i} style={[s.cell, s.headCell, { width: widths[i] }, i > 0 ? s.sep : {}]}>
              <Text
                style={[s.text, s.headText, { fontSize: sizeIn(thai(h), widths[i], BASE_SIZE - 0.5, BOLD) }]}
              >
                {thai(h)}
              </Text>
            </View>
          ))}
        </View>
        {sheet.rows.length === 0 ? (
          <Text style={s.empty}>ไม่มีรายการ</Text>
        ) : (
          sheet.rows.map((row, r) =>
            row.length === 0 ? (
              <View key={r} style={s.gap} />
            ) : (
              <View key={r} style={[s.row, r % 2 === 1 ? s.rowAlt : {}]} wrap={false}>
                {sheet.header.map((_, i) => (
                  <View key={i} style={[s.cell, { width: widths[i] }, i > 0 ? s.sep : {}]}>
                    <Text
                      style={[
                        s.text,
                        { fontSize: sizeIn(thai(text(row[i])), widths[i], BASE_SIZE) },
                        typeof row[i] === 'number' ? s.num : {},
                      ]}
                    >
                      {thai(text(row[i]))}
                    </Text>
                  </View>
                ))}
              </View>
            ),
          )
        )}
      </View>

      <View style={base.footer} fixed>
        <Text>
          {thai(sheet.name)} · {sheet.rows.filter((r) => r.length).length.toLocaleString('th-TH')}{' '}
          แถว
        </Text>
        <Text render={({ pageNumber, totalPages }) => `หน้า ${pageNumber} / ${totalPages}`} />
      </View>
    </Page>
  );
}

export function TrackReportDocument({
  sheets,
  termLabel,
}: {
  sheets: Sheet[];
  termLabel: string;
}) {
  return (
    <Document title={`รายงานสรุปการเลือก Track ${termLabel}`}>
      {sheets.map((sheet, i) => (
        <SheetPage key={i} sheet={sheet} termLabel={termLabel} />
      ))}
    </Document>
  );
}
