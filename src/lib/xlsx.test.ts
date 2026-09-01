import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { buildXlsx, colName, crc32, sheetName } from './xlsx';

/**
 * The writer emits bytes nothing in this repo can open, so the test unzips
 * what it produced and reads the XML back — a workbook Excel repairs on open
 * is a bug the admin discovers in front of the ผู้อำนวยการ, not in CI.
 */

/** Walk the central directory the same way a zip reader does. */
function unzip(buf: Buffer): Map<string, string> {
  const out = new Map<string, string>();
  // End-of-central-directory is last, and has no comment here, so it sits at
  // exactly 22 bytes from the end.
  const end = buf.length - 22;
  assert.equal(buf.readUInt32LE(end), 0x06054b50, 'end-of-central-directory signature');
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);

  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50, 'central directory signature');
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compressed = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    assert.equal(buf.readUInt32LE(offset), 0x04034b50, `local header of ${name}`);
    const lNameLen = buf.readUInt16LE(offset + 26);
    const lExtraLen = buf.readUInt16LE(offset + 28);
    const start = offset + 30 + lNameLen + lExtraLen;
    const body = buf.subarray(start, start + compressed);
    const data = method === 0 ? Buffer.from(body) : inflateRawSync(body);
    assert.equal(crc32(data), crc, `crc of ${name}`);
    out.set(name, data.toString('utf8'));

    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

test('colName counts past Z the way a spreadsheet does', () => {
  assert.equal(colName(0), 'A');
  assert.equal(colName(25), 'Z');
  assert.equal(colName(26), 'AA');
  assert.equal(colName(51), 'AZ');
  assert.equal(colName(52), 'BA');
});

test('sheetName drops what Excel forbids and never returns empty', () => {
  assert.equal(sheetName('TrackSM/บริหาร'), 'TrackSM บริหาร');
  assert.equal(sheetName('[a]:b*c?d'), 'a  b c d');
  assert.equal(sheetName('   '), 'Sheet');
  assert.equal(sheetName('x'.repeat(40)).length, 31);
});

test('a workbook unzips to the parts Excel requires', () => {
  const files = unzip(
    buildXlsx([{ name: 'สรุป', header: ['ชั้น', 'จำนวน'], rows: [['ม.4', 12]] }]),
  );
  for (const part of [
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/workbook.xml',
    'xl/_rels/workbook.xml.rels',
    'xl/styles.xml',
    'xl/worksheets/sheet1.xml',
  ])
    assert.ok(files.has(part), `missing ${part}`);
});

test('Thai text and numbers land in the right cells', () => {
  const files = unzip(
    buildXlsx([
      {
        name: 'รายชื่อ',
        header: ['รหัส', 'ชื่อ', 'จำนวน'],
        rows: [['10234', 'สมชาย ใจดี', 7]],
      },
    ]),
  );
  const sheet = files.get('xl/worksheets/sheet1.xml')!;
  assert.match(sheet, /<t xml:space="preserve">สมชาย ใจดี<\/t>/);
  // A number goes in as a number, not as text — the admin sums this column.
  assert.match(sheet, /<c r="C2"><v>7<\/v><\/c>/);
  // …while a รหัส with leading zeroes stays text, so it keeps them.
  assert.match(sheet, /<c r="A2" t="inlineStr">/);
  assert.match(files.get('xl/workbook.xml')!, /name="รายชื่อ"/);
});

test('XML metacharacters in a name cannot break the sheet', () => {
  const files = unzip(
    buildXlsx([{ name: 'a', header: ['x'], rows: [['<b>&"quoted" \u0007bell']] }]),
  );
  const sheet = files.get('xl/worksheets/sheet1.xml')!;
  assert.match(sheet, /&lt;b&gt;&amp;&quot;quoted&quot; bell/);
  assert.doesNotMatch(sheet, /[\u0000-\u0008]/);
});

test('sheets sharing a name are made distinct rather than colliding', () => {
  const files = unzip(
    buildXlsx([
      { name: 'Track', header: ['a'], rows: [] },
      { name: 'Track', header: ['a'], rows: [] },
      { name: 'Track', header: ['a'], rows: [] },
    ]),
  );
  const workbook = files.get('xl/workbook.xml')!;
  assert.match(workbook, /name="Track"/);
  assert.match(workbook, /name="Track \(2\)"/);
  assert.match(workbook, /name="Track \(3\)"/);
});

test('a sheet with no rows still opens', () => {
  const files = unzip(buildXlsx([{ name: 'ว่าง', header: ['ก'], rows: [] }]));
  assert.match(files.get('xl/worksheets/sheet1.xml')!, /<row r="1">/);
});

test('short ragged rows are padded, so no cell lands in the wrong column', () => {
  const files = unzip(
    buildXlsx([{ name: 'a', header: ['x', 'y', 'z'], rows: [['1'], ['1', '2', '3']] }]),
  );
  const sheet = files.get('xl/worksheets/sheet1.xml')!;
  assert.match(sheet, /<c r="C2"\/>/);
  assert.match(sheet, /<c r="C3" t="inlineStr">/);
});
