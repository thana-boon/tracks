import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRecords, type Enrolment } from './attendance-api-core';

const enrolments: Enrolment[] = [
  { studentId: 1, code: '10001', sectionId: 11 },
  { studentId: 2, code: '10002', sectionId: 11 },
  { studentId: 3, code: '10003', sectionId: 12 },
  // two รอบเรียน on the same day
  { studentId: 4, code: '10004', sectionId: 11 },
  { studentId: 4, code: '10004', sectionId: 12 },
];
const known = { codes: new Set(['10001', '10002', '10003', '10004', '10005']), ids: new Set([1, 2, 3, 4, 5]) };

test('a รหัสนักเรียน finds the one รอบเรียน that student has today', () => {
  const { resolved, rejected } = resolveRecords(
    [
      { studentCode: '10001', present: true },
      { studentCode: ' 10003 ', present: false },
    ],
    enrolments,
    known,
  );
  assert.deepEqual(rejected, []);
  assert.deepEqual(resolved, [
    { studentId: 1, sectionId: 11, present: true },
    { studentId: 3, sectionId: 12, present: false },
  ]);
});

test('our own studentId works as well as the รหัส', () => {
  const { resolved } = resolveRecords([{ studentId: 2, present: true }], enrolments, known);
  assert.deepEqual(resolved, [{ studentId: 2, sectionId: 11, present: true }]);
});

test('a รหัส nobody holds reads differently from a นักเรียน with no class today', () => {
  const { resolved, rejected } = resolveRecords(
    [
      { studentCode: '99999', present: true },
      { studentCode: '10005', present: true },
    ],
    enrolments,
    known,
  );
  assert.equal(resolved.length, 0);
  assert.deepEqual(
    rejected.map((r) => [r.studentCode, r.reason]),
    [
      ['99999', 'unknown_student'],
      ['10005', 'not_enrolled'],
    ],
  );
});

test('two รอบเรียน on the day need a sectionId — narrowing the enrolment settles it', () => {
  const both = resolveRecords([{ studentCode: '10004', present: true }], enrolments, known);
  assert.equal(both.rejected[0]?.reason, 'ambiguous_section');

  const narrowed = resolveRecords(
    [{ studentCode: '10004', present: true }],
    enrolments.filter((e) => e.sectionId === 12),
    known,
  );
  assert.deepEqual(narrowed.resolved, [{ studentId: 4, sectionId: 12, present: true }]);
});

test('the same นักเรียน sent twice keeps the later reading', () => {
  const { resolved } = resolveRecords(
    [
      { studentCode: '10001', present: false },
      { studentId: 1, present: true },
    ],
    enrolments,
    known,
  );
  assert.deepEqual(resolved, [{ studentId: 1, sectionId: 11, present: true }]);
});
