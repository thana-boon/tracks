import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayOutcome,
  evaluateSubject,
  heldDates,
  type AttendanceRecord,
} from './evaluate';

// 2026-06-01 is a Monday; 2026-06-02 Tuesday.
const rec = (
  date: string,
  slot: 'morning' | 'afternoon',
  studentId: number,
  present: boolean,
): AttendanceRecord => ({ date, slot, studentId, present });

test('no records → pending', () => {
  const e = evaluateSubject(1, []);
  assert.equal(e.overall, 'pending');
  assert.equal(e.totalDays, 0);
});

test('full attendance both slots → excellent', () => {
  const records = [
    rec('2026-06-01', 'morning', 1, true),
    rec('2026-06-01', 'afternoon', 1, true),
    rec('2026-06-08', 'morning', 1, true),
    rec('2026-06-08', 'afternoon', 1, true),
  ];
  const e = evaluateSubject(1, records);
  assert.equal(e.overall, 'excellent');
  assert.deepEqual(e.counts, { excellent: 2, partial: 0, absent: 0 });
});

test('half-day attendance → partial day, overall pass', () => {
  const records = [
    rec('2026-06-01', 'morning', 1, true),
    rec('2026-06-01', 'afternoon', 1, false),
  ];
  const e = evaluateSubject(1, records);
  assert.equal(e.days[0].result, 'partial');
  assert.equal(e.overall, 'pass');
});

test('absent every day → fail', () => {
  const records = [
    rec('2026-06-01', 'morning', 1, false),
    rec('2026-06-01', 'afternoon', 1, false),
    rec('2026-06-08', 'morning', 1, false),
    rec('2026-06-08', 'afternoon', 1, false),
  ];
  const e = evaluateSubject(1, records);
  assert.equal(e.overall, 'fail');
  assert.equal(e.attendedRatio, 0);
});

test('a held slot with no record for the student counts as absent', () => {
  // Slot was held (another student has a record) but student 1 has none.
  const records = [
    rec('2026-06-01', 'morning', 2, true),
    rec('2026-06-01', 'afternoon', 2, true),
  ];
  const e = evaluateSubject(1, records);
  assert.equal(e.days[0].result, 'absent');
  assert.equal(e.overall, 'fail');
});

test('only one slot held: present in it → excellent (not penalised)', () => {
  const records = [rec('2026-06-01', 'morning', 1, true)];
  const e = evaluateSubject(1, records);
  assert.equal(e.days[0].result, 'excellent');
  assert.equal(e.days[0].afternoon, null); // not held
  assert.equal(e.overall, 'excellent');
});

test('schedule filter drops dates the subject does not meet on', () => {
  // Subject is scheduled for 1 June only. The 2 June record must be ignored.
  const records = [
    rec('2026-06-01', 'morning', 1, true),
    rec('2026-06-02', 'morning', 1, false), // stray
  ];
  assert.deepEqual(heldDates(records, ['2026-06-01']), ['2026-06-01']);
  const e = evaluateSubject(1, records, ['2026-06-01']);
  assert.equal(e.totalDays, 1);
  assert.equal(e.overall, 'excellent');
});

test('a scheduled date nobody checked is not held and costs nothing', () => {
  const records = [
    rec('2026-06-01', 'morning', 1, true),
    rec('2026-06-01', 'afternoon', 1, true),
  ];
  const e = evaluateSubject(1, records, ['2026-06-01', '2026-06-08']);
  assert.equal(e.totalDays, 1);
  assert.equal(e.overall, 'excellent');
});

test('day outcome: full day ยอดเยี่ยม, half day ผ่าน, absent ไม่ผ่าน', () => {
  assert.equal(dayOutcome(true, true), 'excellent');
  assert.equal(dayOutcome(true, false), 'partial');
  assert.equal(dayOutcome(false, true), 'partial');
  assert.equal(dayOutcome(false, false), 'absent');
  // Only one slot checked at all: present in it is a full day.
  assert.equal(dayOutcome(true, null), 'excellent');
  assert.equal(dayOutcome(null, false), 'absent');
});

test('60% attendance threshold: 3 of 5 days attended → pass', () => {
  const mondays = ['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29'];
  const records: AttendanceRecord[] = [];
  mondays.forEach((d, i) => {
    const present = i < 3; // attends first 3 weeks fully
    records.push(rec(d, 'morning', 1, present));
    records.push(rec(d, 'afternoon', 1, present));
  });
  const e = evaluateSubject(1, records);
  assert.equal(e.attendedRatio, 0.6);
  assert.equal(e.overall, 'pass');
});

test('below threshold: 2 of 5 days → fail', () => {
  const mondays = ['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29'];
  const records: AttendanceRecord[] = [];
  mondays.forEach((d, i) => {
    const present = i < 2;
    records.push(rec(d, 'morning', 1, present));
    records.push(rec(d, 'afternoon', 1, present));
  });
  const e = evaluateSubject(1, records);
  assert.equal(e.overall, 'fail');
});
