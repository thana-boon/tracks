import test from 'node:test';
import assert from 'node:assert/strict';
import { rankBy, tally, type ScoreCell } from './score-rank';

const cell = (
  period: ScoreCell['period'],
  subject: string,
  score: number | null,
  fullScore: number,
  absent = false,
): ScoreCell => ({ period, subject, score, fullScore, absent });

const cells: ScoreCell[] = [
  cell('1-midterm', 'math', 15, 20),
  cell('1-final', 'math', 60, 80),
  cell('1-midterm', 'thai', 10, 20),
  cell('2-midterm', 'math', 20, 20),
];

test('sums scores over full scores, not an average of percents', () => {
  const t = tally(cells, new Set(['1-midterm', '1-final']), new Set(['math']));
  assert.equal(t.score, 75);
  assert.equal(t.fullScore, 100);
  assert.equal(t.percent, 75);
});

test('only the ticked ช่วงสอบ and วิชา count', () => {
  assert.equal(tally(cells, new Set(['1-midterm']), new Set(['math', 'thai'])).percent, 62.5);
  assert.equal(tally(cells, new Set(['2-midterm']), new Set(['math'])).percent, 100);
  assert.equal(tally(cells, new Set(['2-final']), new Set(['math'])).percent, null);
});

test('ขาดสอบ is a zero, a score not keyed in yet is left out', () => {
  const t = tally(
    [cell('1-midterm', 'a', 20, 20), cell('1-midterm', 'b', null, 20, true), cell('1-midterm', 'c', null, 20)],
    new Set(['1-midterm']),
    new Set(['a', 'b', 'c']),
  );
  assert.equal(t.percent, 50);
  assert.equal(t.absent, 1);
  assert.equal(t.pending, 1);
});

test('ties share a place and the next one skips; no score gets no rank', () => {
  const ranked = rankBy(
    [
      { id: 'a', p: 80 },
      { id: 'b', p: 90 },
      { id: 'c', p: null },
      { id: 'd', p: 80 },
      { id: 'e', p: 70 },
    ],
    (x) => x.p,
  );
  assert.deepEqual(
    ranked.map((r) => [r.id, r.rank]),
    [
      ['b', 1],
      ['a', 2],
      ['d', 2],
      ['e', 4],
      ['c', null],
    ],
  );
});
