/**
 * จัดอันดับคะแนนสอบ — the arithmetic, kept pure.
 *
 * The scores themselves come from the SchoolOS score service (score-api.ts);
 * this file only decides what "รวมแล้วคิดเป็นกี่ %" means and who comes
 * where. It runs in the browser, because the ผู้ดูแล ticks ช่วงสอบ and วิชา in
 * and out and expects the order to follow at once — a round trip per tick
 * would make the page feel like a form.
 */

/** "1-midterm" — one ช่วงสอบ of the year: ภาคเรียน × กลางภาค/ปลายภาค. */
export type PeriodKey = `${1 | 2}-${'midterm' | 'final'}`;

export interface ScorePeriod {
  key: PeriodKey;
  semester: number;
  examType: 'midterm' | 'final';
  /** "ภาคเรียนที่ 1 — สอบกลางภาค" as the score service names it */
  name: string;
}

export interface ScoreSubject {
  /** what the ผู้ดูแล ticks — the same วิชา in กลางภาค and ปลายภาค shares it */
  key: string;
  code: string;
  name: string;
  gradeLevel: string;
}

/** One นักเรียน × one วิชา × one ช่วงสอบ. */
export interface ScoreCell {
  period: PeriodKey;
  subject: string;
  score: number | null;
  fullScore: number;
  absent: boolean;
}

export interface Tally {
  /** วิชา × ช่วงสอบ that went into the average */
  counted: number;
  /** null when not one counted วิชา has a score yet */
  percent: number | null;
  /** วิชาที่ขาดสอบ — counted as 0% */
  absent: number;
  /** วิชาที่ครูยังไม่กรอก — left out of the average */
  pending: number;
}

/** The subject key the ผู้ดูแล ticks: code and name, since either alone can repeat. */
export function subjectKey(code: string, name: string): string {
  return `${code.trim()}|${name.trim()}`;
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * ค่าเฉลี่ยร้อยละ over the ช่วงสอบ and วิชา picked: each วิชา of each ช่วงสอบ
 * is turned into a percent of its own full score first, and the percents are
 * averaged.
 *
 * Percent first, not one big sum of scores: full scores differ from วิชา to
 * วิชา (20, 30, 50…), and a sum would let the วิชา with the biggest full score
 * decide the order. This way every วิชา in every ช่วงสอบ weighs the same.
 * ขาดสอบ is a 0% the นักเรียน earned; a score nobody has keyed in yet is not,
 * so it is left out of the average rather than dragging the นักเรียน down for
 * a ครู's backlog.
 */
export function tally(
  cells: ScoreCell[],
  periods: ReadonlySet<string>,
  subjects: ReadonlySet<string>,
): Tally {
  let sum = 0;
  let counted = 0;
  let absent = 0;
  let pending = 0;
  for (const c of cells) {
    if (!periods.has(c.period) || !subjects.has(c.subject)) continue;
    // A วิชา with no full score cannot be a percent of anything.
    if (c.fullScore <= 0) continue;
    if (c.absent) {
      absent++;
      counted++;
    } else if (c.score === null) {
      pending++;
    } else {
      sum += (c.score / c.fullScore) * 100;
      counted++;
    }
  }
  return {
    counted,
    percent: counted > 0 ? round2(sum / counted) : null,
    absent,
    pending,
  };
}

/**
 * อันดับแบบแข่งขัน — 1, 2, 2, 4 — on the percent as shown (two decimals), so
 * two นักเรียน who read the same number on the screen share a place. Those
 * with no percent at all get no อันดับ and sink to the bottom.
 */
export function rankBy<T>(items: T[], percentOf: (t: T) => number | null): (T & { rank: number | null })[] {
  const sorted = [...items].sort((a, b) => (percentOf(b) ?? -1) - (percentOf(a) ?? -1));
  let rank = 0;
  let last: number | null = null;
  return sorted.map((item, i) => {
    const p = percentOf(item);
    if (p === null) return { ...item, rank: null };
    if (p !== last) {
      rank = i + 1;
      last = p;
    }
    return { ...item, rank };
  });
}
