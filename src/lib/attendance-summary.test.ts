import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  summarizeAttendance,
  type HomeroomReportEntry,
  type ReportDay,
  type ReportStudent,
} from './attendance-summary';

const student: ReportStudent = {
  id: 1,
  code: '12345',
  fullName: 'นายทดสอบ ระบบ',
  gradeLevel: 'ม.5',
  classroom: '2',
  classNumber: 7,
};

function day(over: Partial<ReportDay>): ReportDay {
  return {
    date: '2026-07-01',
    subjectCode: 'ET1',
    subjectName: 'หุ่นยนต์',
    sectionName: 'รอบที่ 1',
    morning: null,
    afternoon: null,
    result: null,
    ...over,
  };
}

function entry(days: ReportDay[]): HomeroomReportEntry[] {
  return [{ student, days }];
}

test('no class days → everything zero, ratio 0', () => {
  const [row] = summarizeAttendance(entry([]));
  assert.equal(row.held, 0);
  assert.equal(row.full, 0);
  assert.equal(row.absent, 0);
  assert.equal(row.attendedRatio, 0);
  assert.deepEqual(row.lines, []);
});

test('มาเต็มวัน / ครึ่งวัน / ขาด are counted separately', () => {
  const [row] = summarizeAttendance(
    entry([
      day({ date: '2026-07-01', result: 'excellent' }),
      day({ date: '2026-07-02', result: 'partial' }),
      day({ date: '2026-07-03', result: 'absent' }),
    ]),
  );
  assert.equal(row.full, 1);
  assert.equal(row.partial, 1);
  assert.equal(row.absent, 1);
  assert.equal(row.held, 3);
  // มาครึ่งวันก็นับว่ามา — 2 ใน 3 วัน
  assert.equal(Math.round(row.attendedRatio * 100), 67);
});

test('a day nobody checked is pending — never an absence', () => {
  const [row] = summarizeAttendance(
    entry([
      day({ date: '2026-07-01', result: 'excellent' }),
      day({ date: '2026-07-08', result: null }),
      day({ date: '2026-07-15', result: null }),
    ]),
  );
  assert.equal(row.pending, 2);
  assert.equal(row.absent, 0);
  // Pending days stay out of the denominator, so one attended day is still 100%.
  assert.equal(row.held, 1);
  assert.equal(row.attendedRatio, 1);
});

test('every day still pending → ratio 0 without any absence', () => {
  const [row] = summarizeAttendance(entry([day({ result: null }), day({ date: '2026-07-08' })]));
  assert.equal(row.pending, 2);
  assert.equal(row.held, 0);
  assert.equal(row.absent, 0);
  assert.equal(row.attendedRatio, 0);
});

test('counts span every วิชา, and each วิชา keeps its own line', () => {
  const [row] = summarizeAttendance(
    entry([
      day({ date: '2026-07-01', subjectCode: 'ET1', result: 'excellent' }),
      day({ date: '2026-07-02', subjectCode: 'ET1', result: 'absent' }),
      day({ date: '2026-07-03', subjectCode: 'MU2', subjectName: 'ดนตรี', result: 'excellent' }),
    ]),
  );
  assert.equal(row.full, 2);
  assert.equal(row.absent, 1);
  assert.equal(row.lines.length, 2);

  const et = row.lines.find((l) => l.subjectCode === 'ET1')!;
  assert.equal(et.full, 1);
  assert.equal(et.absent, 1);
  assert.equal(et.held, 2);

  const mu = row.lines.find((l) => l.subjectCode === 'MU2')!;
  assert.equal(mu.full, 1);
  assert.equal(mu.held, 1);
});

test('two รอบ of the same วิชา do not merge into one line', () => {
  const [row] = summarizeAttendance(
    entry([
      day({ date: '2026-07-01', sectionName: 'รอบที่ 1', result: 'excellent' }),
      day({ date: '2026-07-02', sectionName: 'รอบที่ 2', result: 'absent' }),
    ]),
  );
  assert.equal(row.lines.length, 2);
  assert.deepEqual(
    row.lines.map((l) => l.sectionName),
    ['รอบที่ 1', 'รอบที่ 2'],
  );
});

test('each student is summarized independently', () => {
  const other: ReportStudent = { ...student, id: 2, code: '54321', classNumber: 8 };
  const rows = summarizeAttendance([
    { student, days: [day({ result: 'excellent' })] },
    { student: other, days: [day({ result: 'absent' })] },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].full, 1);
  assert.equal(rows[0].absent, 0);
  assert.equal(rows[1].full, 0);
  assert.equal(rows[1].absent, 1);
});
