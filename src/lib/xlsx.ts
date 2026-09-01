/**
 * The smallest .xlsx writer that does the job — a workbook of plain sheets,
 * a bold header row, and column widths.
 *
 * Written by hand rather than pulled in as a dependency: an .xlsx is a zip of
 * five small XML files, Node already ships the deflate, and the alternative
 * (a CSV renamed) hands the admin one sheet when the รายงาน has three, and
 * hands Excel a Thai file it opens as mojibake often enough to be a support
 * call. Nothing here knows about Track — it takes rows and gives back bytes.
 */
import { deflateRawSync } from 'node:zlib';

export type Cell = string | number | null | undefined;

export interface Sheet {
  /** tab name — trimmed to what Excel accepts */
  name: string;
  /** first row, rendered bold and frozen */
  header: string[];
  rows: Cell[][];
  /** per-column width in characters; missing entries fall back to a default */
  widths?: number[];
}

// ── XML ──────────────────────────────────────────────────────

function esc(s: string): string {
  return (
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      // Excel refuses to open a file with raw control characters in it, and a
      // stray one out of a name field should cost the admin that character,
      // not the whole download.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  );
}

/** 0 → "A", 25 → "Z", 26 → "AA" */
export function colName(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - rem) / 26);
  }
  return out;
}

/**
 * Excel's own rules for a tab name: 31 characters, none of []:*?/\, and never
 * empty. Applied here rather than trusted to the caller because a file that
 * breaks one of them does not open at all.
 */
export function sheetName(raw: string, fallback = 'Sheet'): string {
  const cleaned = raw
    .replace(/[[\]:*?/\\]/g, ' ')
    .trim()
    .slice(0, 31);
  return cleaned || fallback;
}

function cellXml(ref: string, value: Cell, bold: boolean): string {
  const style = bold ? ' s="1"' : '';
  if (value === null || value === undefined || value === '') return `<c r="${ref}"${style}/>`;
  if (typeof value === 'number' && Number.isFinite(value))
    return `<c r="${ref}"${style}><v>${value}</v></c>`;
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(
    String(value),
  )}</t></is></c>`;
}

function sheetXml(sheet: Sheet): string {
  const all = [sheet.header as Cell[], ...sheet.rows];
  const colCount = all.reduce((n, r) => Math.max(n, r.length), 0);
  const cols = colCount
    ? `<cols>${Array.from(
        { length: colCount },
        (_, i) =>
          `<col min="${i + 1}" max="${i + 1}" width="${sheet.widths?.[i] ?? 16}" customWidth="1"/>`,
      ).join('')}</cols>`
    : '';
  const rows = all
    .map((row, r) => {
      const cells = Array.from({ length: colCount }, (_, c) =>
        cellXml(`${colName(c)}${r + 1}`, row[c], r === 0),
      ).join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

// ── zip ──────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface Entry {
  name: string;
  data: Buffer;
}

/** A zip archive of deflated entries — no directories, no zip64. */
function zip(entries: Entry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const deflated = deflateRawSync(e.data, { level: 9 });
    // A deflate that grew the file is not compression — store it instead.
    const stored = deflated.length >= e.data.length;
    const body = stored ? e.data : deflated;
    const method = stored ? 0 : 8;
    const crc = crc32(e.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // names are UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10); // mod time — fixed, so the file is reproducible
    local.writeUInt16LE(0x21, 12); // mod date — 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

// ── workbook ─────────────────────────────────────────────────

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Tahoma"/></font><font><b/><sz val="11"/><name val="Tahoma"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`;

/**
 * One workbook, one Buffer. Sheet names are made unique as well as legal — two
 * Tracks named alike would otherwise produce a file Excel repairs on open.
 */
export function buildXlsx(sheets: Sheet[]): Buffer {
  if (!sheets.length) throw new Error('a workbook needs at least one sheet');

  const used = new Set<string>();
  const named = sheets.map((s, i) => {
    let name = sheetName(s.name, `Sheet${i + 1}`);
    if (used.has(name)) {
      const stem = name.slice(0, 27);
      let n = 2;
      while (used.has(`${stem} (${n})`)) n++;
      name = `${stem} (${n})`;
    }
    used.add(name);
    return { ...s, name };
  });

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${named
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('')}</Types>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${named
    .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('')}</sheets></workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${named
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join(
      '',
    )}<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  return zip([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(RELS, 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(workbook, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(workbookRels, 'utf8') },
    { name: 'xl/styles.xml', data: Buffer.from(STYLES, 'utf8') },
    ...named.map((s, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: Buffer.from(sheetXml(s), 'utf8'),
    })),
  ]);
}
