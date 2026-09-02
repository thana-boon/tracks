import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrackReport, reportSheets, type ReportStudent } from './track-report';
import type { Term, TrackRow } from './track-core';

const term: Term = { yearId: 1, year: '2569', semester: 1 };

function track(id: number, name: string, options: string[] = [], active = true): TrackRow {
  return {
    id,
    yearId: 1,
    semester: 1,
    name,
    description: null,
    gradeLevels: [],
    opensAt: null,
    closesAt: null,
    active,
    options: options.map((o, i) => ({
      id: id * 100 + i,
      name: o,
      description: null,
      sortOrder: i,
      active: true,
    })),
  };
}

let nextId = 1;
function student(p: Partial<ReportStudent> = {}): ReportStudent {
  const id = nextId++;
  return {
    id,
    code: String(10000 + id),
    fullName: `นักเรียน ${id}`,
    nickname: null,
    gradeLevel: 'ม.4',
    classroom: '1',
    classNumber: id,
    trackId: null,
    trackName: null,
    optionId: null,
    optionName: null,
    byAdmin: false,
    ...p,
  };
}

test('a สาย nobody picked is still in the report, as a zero', () => {
  const r = buildTrackReport(term, [track(1, 'TrackSM'), track(2, 'TrackET')], [
    student({ trackId: 1, trackName: 'TrackSM' }),
  ]);
  assert.equal(r.tracks.length, 2);
  assert.equal(r.tracks.find((t) => t.id === 2)!.total, 0);
});

test('totals split the students into chosen and pending, and never lose one', () => {
  const r = buildTrackReport(term, [track(1, 'A')], [
    student({ trackId: 1, trackName: 'A' }),
    student({ trackId: 1, trackName: 'A' }),
    student(),
  ]);
  assert.deepEqual(r.totals, { students: 3, chosen: 2, pending: 1 });
  assert.equal(r.pending.length, 1);
});

test('a choice pointing at another term’s สาย counts as not yet chosen', () => {
  // The row exists, but no สาย of *this* ภาคเรียน matches it — treating it as
  // chosen would hide the student from the list the ผู้ดูแล chases.
  const r = buildTrackReport(term, [track(1, 'A')], [
    student({ trackId: 99, trackName: 'สายของเทอมก่อน' }),
  ]);
  assert.equal(r.totals.pending, 1);
  assert.equal(r.tracks[0].total, 0);
});

test('ข้อย่อย are counted under their own สาย', () => {
  const sm = track(1, 'TrackSM', ['กฎหมาย', 'บริหาร']);
  const [law, admin] = sm.options;
  const r = buildTrackReport(term, [sm], [
    student({ trackId: 1, trackName: 'TrackSM', optionId: law.id, optionName: 'กฎหมาย' }),
    student({ trackId: 1, trackName: 'TrackSM', optionId: law.id, optionName: 'กฎหมาย' }),
    student({ trackId: 1, trackName: 'TrackSM', optionId: admin.id, optionName: 'บริหาร' }),
  ]);
  assert.equal(r.tracks[0].total, 3);
  assert.deepEqual(
    r.tracks[0].options.map((o) => [o.name, o.count]),
    [
      ['กฎหมาย', 2],
      ['บริหาร', 1],
    ],
  );
});

test('tracks rank by size, ties by name', () => {
  const r = buildTrackReport(term, [track(1, 'ข'), track(2, 'ก'), track(3, 'ค')], [
    student({ trackId: 3, trackName: 'ค' }),
    student({ trackId: 3, trackName: 'ค' }),
    student({ trackId: 1, trackName: 'ข' }),
    student({ trackId: 2, trackName: 'ก' }),
  ]);
  assert.deepEqual(
    r.tracks.map((t) => t.name),
    ['ค', 'ก', 'ข'],
  );
});

test('each ห้อง carries its own chosen / pending split', () => {
  const r = buildTrackReport(term, [track(1, 'A')], [
    student({ gradeLevel: 'ม.4', classroom: '1', trackId: 1, trackName: 'A' }),
    student({ gradeLevel: 'ม.4', classroom: '1' }),
    student({ gradeLevel: 'ม.5', classroom: '2', trackId: 1, trackName: 'A' }),
  ]);
  assert.equal(r.rooms.length, 2);
  const [first, second] = r.rooms;
  assert.deepEqual([first.gradeLevel, first.classroom], ['ม.4', '1']);
  assert.deepEqual([first.total, first.chosen, first.pending], [2, 1, 1]);
  assert.deepEqual([second.total, second.chosen, second.pending], [1, 1, 0]);
});

test('ระดับชั้นที่เลือก is broken out per สาย', () => {
  const r = buildTrackReport(term, [track(1, 'A')], [
    student({ gradeLevel: 'ม.4', trackId: 1, trackName: 'A' }),
    student({ gradeLevel: 'ม.6', trackId: 1, trackName: 'A' }),
    student({ gradeLevel: 'ม.6', trackId: 1, trackName: 'A' }),
  ]);
  assert.deepEqual(r.tracks[0].byGrade, [
    { grade: 'ม.4', count: 1 },
    { grade: 'ม.6', count: 2 },
  ]);
});

test('a student with no ชั้น or ห้อง lands in one bucket rather than crashing', () => {
  const r = buildTrackReport(term, [track(1, 'A')], [
    student({ gradeLevel: null, classroom: null, classNumber: null }),
  ]);
  assert.equal(r.rooms.length, 1);
  assert.deepEqual([r.rooms[0].gradeLevel, r.rooms[0].classroom], ['—', '—']);
});

test('the workbook carries a sheet per question plus one per สาย', () => {
  const r = buildTrackReport(term, [track(1, 'TrackSM'), track(2, 'TrackET')], [
    student({ trackId: 1, trackName: 'TrackSM' }),
    student(),
  ]);
  const sheets = reportSheets(r);
  assert.deepEqual(sheets.map((s) => s.name), [
    'รายบุคคล',
    'สรุปจำนวนแต่ละ Track',
    'สรุปตามห้อง',
    'ยังไม่เลือก',
    'TrackSM',
    'TrackET',
  ]);
  // Every student on รายบุคคล, only the unchosen on ยังไม่เลือก.
  assert.equal(sheets[0].rows.length, 2);
  assert.equal(sheets[3].rows.length, 1);
});

test('สรุปตามห้อง gets one column per สาย, zero where a ห้อง chose none', () => {
  const r = buildTrackReport(term, [track(1, 'A'), track(2, 'B')], [
    student({ classroom: '1', trackId: 1, trackName: 'A' }),
    student({ classroom: '2', trackId: 2, trackName: 'B' }),
  ]);
  const rooms = reportSheets(r).find((s) => s.name === 'สรุปตามห้อง')!;
  assert.deepEqual(rooms.header.slice(5), r.tracks.map((t) => t.name));
  assert.deepEqual(rooms.rows[0].slice(5), [1, 0]);
  assert.deepEqual(rooms.rows[1].slice(5), [0, 1]);
});

test('สถานะ tells a self-chosen row from one an admin set', () => {
  const r = buildTrackReport(term, [track(1, 'A')], [
    student({ trackId: 1, trackName: 'A' }),
    student({ trackId: 1, trackName: 'A', byAdmin: true }),
    student(),
  ]);
  const rows = reportSheets(r)[0].rows.map((row) => row[row.length - 1]);
  assert.deepEqual(rows, ['เลือกเอง', 'ผู้ดูแลกำหนด', 'ยังไม่เลือก']);
});

test('a term with nobody chosen reports 0% rather than NaN', () => {
  const r = buildTrackReport(term, [track(1, 'A')], [student()]);
  const counts = reportSheets(r).find((s) => s.name === 'สรุปจำนวนแต่ละ Track')!;
  assert.equal(counts.rows[0][3], '0%');
});
