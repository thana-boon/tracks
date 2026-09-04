import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectInTrack, trackChoosable, trackPhaseLabel, trackWindow } from './track-core';
import { fromSchoolDateTimeInput, toSchoolDateTimeInput } from './utils';

/** 09:00 น. school time on 1 มิถุนายน, as the instant it actually is. */
const at = (school: string) => fromSchoolDateTimeInput(school)!;

const open = (opensAt: string | null, closesAt: string | null, active = true) => ({
  opensAt: opensAt && at(opensAt).toISOString(),
  closesAt: closesAt && at(closesAt).toISOString(),
  active,
});

test('no window at all is open, and stays open', () => {
  const t = open(null, null);
  assert.equal(trackWindow(t, at('2026-06-01T09:00')).state, 'open');
  assert.equal(trackWindow(t, at('2030-01-01T00:00')).state, 'open');
});

test('ปิดไม่ให้เลือก outranks a window that says open', () => {
  const t = open('2026-06-01T08:00', '2026-06-30T16:00', false);
  assert.equal(trackWindow(t, at('2026-06-10T09:00')).state, 'closed');
  assert.equal(trackChoosable(t, at('2026-06-10T09:00')), false);
});

test('before, inside and after the window', () => {
  const t = open('2026-06-01T08:00', '2026-06-30T16:00');
  assert.equal(trackWindow(t, at('2026-05-31T23:59')).state, 'before');
  assert.equal(trackWindow(t, at('2026-06-01T08:00')).state, 'open');
  assert.equal(trackWindow(t, at('2026-06-30T15:59')).state, 'open');
  assert.equal(trackWindow(t, at('2026-06-30T16:00')).state, 'after');
});

test('one-sided windows fence only their own side', () => {
  const fromOnly = open('2026-06-01T08:00', null);
  assert.equal(trackWindow(fromOnly, at('2026-05-31T08:00')).state, 'before');
  assert.equal(trackWindow(fromOnly, at('2030-01-01T00:00')).state, 'open');

  const untilOnly = open(null, '2026-06-30T16:00');
  assert.equal(trackWindow(untilOnly, at('2020-01-01T00:00')).state, 'open');
  assert.equal(trackWindow(untilOnly, at('2026-06-30T16:01')).state, 'after');
});

test('a datetime-local value is read as school time, not the server’s', () => {
  // 08:00 น. in Bangkok is 01:00 UTC — the seven hours a UTC container would
  // otherwise shift the opening by.
  assert.equal(at('2026-06-01T08:00').toISOString(), '2026-06-01T01:00:00.000Z');
  assert.equal(toSchoolDateTimeInput(at('2026-06-01T08:00')), '2026-06-01T08:00');
  assert.equal(fromSchoolDateTimeInput(''), null);
  assert.equal(fromSchoolDateTimeInput('2026-06-01'), null);
});

test('a สาย shows only the วิชา of its own ภาคเรียน and ช่วง', () => {
  const track = { semester: 1, phase: 2 };
  assert.equal(subjectInTrack(track, { semester: 1, phase: 2 }), true);
  assert.equal(subjectInTrack(track, { semester: 1, phase: 1 }), false);
  assert.equal(subjectInTrack(track, { semester: 2, phase: 2 }), false);
  // A วิชา nobody has placed in a ช่วง is not promised to anyone.
  assert.equal(subjectInTrack(track, { semester: null, phase: null }), false);
  assert.equal(subjectInTrack(track, { semester: 1, phase: null }), false);
});

test('a สาย that runs ทั้งภาคเรียน takes both ช่วง of that ภาคเรียน', () => {
  const track = { semester: 2, phase: null };
  assert.equal(subjectInTrack(track, { semester: 2, phase: 1 }), true);
  assert.equal(subjectInTrack(track, { semester: 2, phase: 2 }), true);
  assert.equal(subjectInTrack(track, { semester: 1, phase: 1 }), false);
  assert.equal(subjectInTrack(track, { semester: 2, phase: null }), false);
  assert.equal(trackPhaseLabel(null), 'ทั้งภาคเรียน');
  assert.equal(trackPhaseLabel(1), 'ช่วงที่ 1');
});
