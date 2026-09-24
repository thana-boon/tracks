import test from 'node:test';
import assert from 'node:assert/strict';
import { changeNote, changeStanding, choiceByAdmin } from './track-core';
import { fromSchoolDateTimeInput } from './utils';

const at = (school: string) => fromSchoolDateTimeInput(school)!;

const held = (changeLimit: number, extra: Partial<Parameters<typeof changeStanding>[0]> = {}) => ({
  changeLimit,
  changesOpen: true,
  opensAt: null,
  closesAt: null,
  active: true,
  ...extra,
});

test('a limit of 0 is the old เลือกได้ครั้งเดียว', () => {
  const s = changeStanding(held(0), 0);
  assert.equal(s.blocked, 'none');
  assert.equal(changeNote(s), 'เลือกแล้วแก้ไขไม่ได้');
});

test('changes count down, then stop', () => {
  assert.deepEqual(changeStanding(held(2), 0), { limit: 2, used: 0, left: 2, blocked: null });
  assert.equal(changeNote(changeStanding(held(2), 1)), 'คุณแก้ไขได้อีก 1 ครั้ง (จากทั้งหมด 2 ครั้ง)');
  assert.equal(changeStanding(held(2), 2).blocked, 'used');
  // A limit lowered below what was already spent is spent, not negative.
  assert.equal(changeStanding(held(1), 3).left, 0);
});

test('the ผู้ดูแล switch freezes changes without spending them', () => {
  const s = changeStanding(held(2, { changesOpen: false }), 1);
  assert.equal(s.blocked, 'frozen');
  assert.equal(s.left, 1);
});

test('ปิดรับ is the deadline for changing too', () => {
  const t = held(3, { closesAt: at('2026-06-30T16:00').toISOString() });
  assert.equal(changeStanding(t, 0, at('2026-06-30T15:59')).blocked, null);
  assert.equal(changeStanding(t, 0, at('2026-06-30T16:00')).blocked, 'after');
});

test('closing การเลือก on the held สาย does not trap its holders', () => {
  assert.equal(changeStanding(held(1, { active: false }), 0).blocked, null);
});

test('the last hand on a choice decides who made it', () => {
  assert.equal(choiceByAdmin('student:person:7', null), false);
  assert.equal(choiceByAdmin('admin:1', null), true);
  assert.equal(choiceByAdmin('student:person:7', 'admin:1'), true);
  assert.equal(choiceByAdmin('admin:1', 'student:person:7'), false);
});
