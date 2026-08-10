import test from 'node:test';
import assert from 'node:assert/strict';
import { byClassOrder, compareClassLabels } from './utils';

/**
 * เช็คชื่อ, ผลเช็คชื่อ and พิมพ์ใบเช็คชื่อ are all read the same way: the teacher
 * knows the room and hunts for its line. These pin down that the list comes out
 * in the order that label is read in.
 */

/** How the รอบ are actually named — "ม.4 กลุ่มเรียนที่ 1" … "ม.5 กลุ่มเรียนที่ 3". */
test('ชั้น first, then กลุ่ม', () => {
  const shuffled = [
    'ม.5 กลุ่มเรียนที่ 2',
    'ม.4 กลุ่มเรียนที่ 3',
    'ม.6 กลุ่มเรียนที่ 1',
    'ม.4 กลุ่มเรียนที่ 1',
    'ม.5 กลุ่มเรียนที่ 1',
    'ม.4 กลุ่มเรียนที่ 2',
  ];
  assert.deepEqual(shuffled.sort(compareClassLabels), [
    'ม.4 กลุ่มเรียนที่ 1',
    'ม.4 กลุ่มเรียนที่ 2',
    'ม.4 กลุ่มเรียนที่ 3',
    'ม.5 กลุ่มเรียนที่ 1',
    'ม.5 กลุ่มเรียนที่ 2',
    'ม.6 กลุ่มเรียนที่ 1',
  ]);
});

/** The reason a plain text sort will not do. */
test('กลุ่ม 10 follows กลุ่ม 9, not กลุ่ม 1', () => {
  const names = ['ม.4 กลุ่มเรียนที่ 10', 'ม.4 กลุ่มเรียนที่ 2', 'ม.4 กลุ่มเรียนที่ 9'];
  assert.deepEqual(names.sort(compareClassLabels), [
    'ม.4 กลุ่มเรียนที่ 2',
    'ม.4 กลุ่มเรียนที่ 9',
    'ม.4 กลุ่มเรียนที่ 10',
  ]);
});

/** A รอบ may be named anything; the ชั้น in it still decides where it sits. */
test('the ชั้น is found wherever it sits in the label', () => {
  const names = ['รอบบ่าย ม.5', 'กลุ่มเช้า (ม.4)', 'รอบเช้า ม.6'];
  assert.deepEqual(names.sort(compareClassLabels), [
    'กลุ่มเช้า (ม.4)',
    'รอบบ่าย ม.5',
    'รอบเช้า ม.6',
  ]);
});

/** A รอบ named after its date has no ชั้น to sort on — it goes last, not first. */
test('labels with no ชั้น keep to the end', () => {
  const names = ['12 ก.ค. +2', 'ม.6 กลุ่มเรียนที่ 1', 'ม.4 กลุ่มเรียนที่ 1'];
  assert.deepEqual(names.sort(compareClassLabels), [
    'ม.4 กลุ่มเรียนที่ 1',
    'ม.6 กลุ่มเรียนที่ 1',
    '12 ก.ค. +2',
  ]);
});

/** วิชา no longer breaks the run of a ชั้น — it only breaks a tie inside one. */
test('two วิชา of the same ห้อง stay together, ordered by หมวด then รหัส', () => {
  const sections = [
    { name: 'ม.5 กลุ่มเรียนที่ 1', groupCode: 'MED', subjectCode: 'MED002' },
    { name: 'ม.4 กลุ่มเรียนที่ 1', groupCode: 'SM', subjectCode: 'SM001' },
    { name: 'ม.4 กลุ่มเรียนที่ 1', groupCode: 'ET', subjectCode: 'ET003' },
    { name: 'ม.4 กลุ่มเรียนที่ 1', groupCode: 'ET', subjectCode: 'ET001' },
  ];
  assert.deepEqual(
    sections.sort(byClassOrder).map((s) => `${s.name} · ${s.subjectCode}`),
    [
      'ม.4 กลุ่มเรียนที่ 1 · ET001',
      'ม.4 กลุ่มเรียนที่ 1 · ET003',
      'ม.4 กลุ่มเรียนที่ 1 · SM001',
      'ม.5 กลุ่มเรียนที่ 1 · MED002',
    ],
  );
});
