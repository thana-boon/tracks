import test from 'node:test';
import assert from 'node:assert/strict';
import { isTrackGrade, TRACK_GRADES } from './utils';

/**
 * The rule this system is built on: วิชาเสริมเปิดให้เฉพาะ ม.4-6. It decides who
 * may hold a student session at all (see admitStudent), so the three grades it
 * admits and the ones it turns away are both worth pinning down.
 */

test('every grade this system serves is admitted', () => {
  for (const g of TRACK_GRADES) assert.equal(isTrackGrade(g), true, g);
});

test('junior grades are turned away', () => {
  for (const g of ['ม.1', 'ม.2', 'ม.3']) assert.equal(isTrackGrade(g), false, g);
});

test('ประถม and อนุบาล are turned away', () => {
  for (const g of ['ป.1', 'ป.6', 'อ.2']) assert.equal(isTrackGrade(g), false, g);
});

/**
 * The label arrives from the Users Service, a sync, and a URL, so it is not
 * always punctuated the same way. A missing full stop must not be the thing
 * that decides a login.
 */
test('the grade is parsed, not string-matched', () => {
  for (const g of ['ม4', 'ม. 5', 'ม.6']) assert.equal(isTrackGrade(g), true, g);
});

/** A student with no enrolment in the current year has no grade to check. */
test('a missing grade is not a track grade', () => {
  assert.equal(isTrackGrade(null), false);
  assert.equal(isTrackGrade(undefined), false);
  assert.equal(isTrackGrade(''), false);
});

/** ม.7 does not exist, and neither does anything else past ม.6. */
test('nothing above ม.6 sneaks in', () => {
  for (const g of ['ม.7', 'ม.60', 'ม.46']) assert.equal(isTrackGrade(g), false, g);
});
