/**
 * ผลการเรียนวิชาเสริม — computed purely from attendance records (spec §4.5).
 *
 * This module is a pure function of its inputs: no DB, no dates-from-clock, no
 * UI. That is deliberate — it is the heart of the system and must be testable
 * in isolation (`npm test`).
 *
 * Model
 * ─────
 * A subject meets on fixed weekdays (subject_days). Each class date has two
 * slots: morning and afternoon. A slot on a date counts as "held" when at
 * least one attendance record exists for it — a slot the teacher never
 * checked is not held and cannot count against anyone.
 *
 * Per held date, per student (spec table):
 *   present in every held slot          → excellent  (มาตรง — ยอดเยี่ยม)
 *   present in some but not every slot  → partial    (มาครึ่งวัน — ผ่าน)
 *   present in none                     → absent     (ไม่มาเลย — ไม่ผ่าน)
 *
 * Overall, per subject:
 *   no held dates yet                   → pending    (รอประเมิน)
 *   every held date excellent           → excellent  (ยอดเยี่ยม)
 *   attended ≥ PASS_MIN_RATIO of dates  → pass       (ผ่าน)   [partial counts]
 *   otherwise                           → fail       (ไม่ผ่าน)
 */

export type Slot = 'morning' | 'afternoon';

export interface AttendanceRecord {
  /** "YYYY-MM-DD" class date */
  date: string;
  slot: Slot;
  /** the student this record belongs to */
  studentId: number;
  present: boolean;
}

export type DayResult = 'excellent' | 'partial' | 'absent';
export type OverallResult = 'excellent' | 'pass' | 'fail' | 'pending';

/** Fraction of held dates a student must attend (fully or partially) to pass. */
export const PASS_MIN_RATIO = 0.6;

export const DAY_RESULT_LABEL: Record<DayResult, string> = {
  excellent: 'มาตรง',
  partial: 'มาครึ่งวัน',
  absent: 'ไม่มา',
};

export const OVERALL_LABEL: Record<OverallResult, string> = {
  excellent: 'ยอดเยี่ยม',
  pass: 'ผ่าน',
  fail: 'ไม่ผ่าน',
  pending: 'รอประเมิน',
};

export interface DayEvaluation {
  date: string;
  /** slots actually held (checked) on this date */
  heldSlots: Slot[];
  /** per-slot presence for the student; null = slot not held */
  morning: boolean | null;
  afternoon: boolean | null;
  result: DayResult;
}

export interface SubjectEvaluation {
  days: DayEvaluation[];
  counts: { excellent: number; partial: number; absent: number };
  /** held dates in total */
  totalDays: number;
  /** (excellent + partial) / totalDays; 0 when nothing held */
  attendedRatio: number;
  overall: OverallResult;
}

/** Weekday index (0=Sun…6=Sat) of "YYYY-MM-DD", timezone-proof. */
function weekday(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Distinct held dates for a subject, sorted ascending. When the subject has
 * declared meeting weekdays, dates falling outside them are ignored (a stray
 * record on a wrong day must not change anyone's result); with no declared
 * days every checked date counts.
 */
export function heldDates(
  records: Pick<AttendanceRecord, 'date'>[],
  meetingDays?: number[],
): string[] {
  const filter =
    meetingDays && meetingDays.length > 0 ? new Set(meetingDays) : null;
  const dates = new Set<string>();
  for (const r of records) {
    if (filter && !filter.has(weekday(r.date))) continue;
    dates.add(r.date);
  }
  return [...dates].sort();
}

/**
 * Evaluate one student in one subject from the subject's full attendance
 * records (all students — needed to know which slots were held).
 */
export function evaluateSubject(
  studentId: number,
  allRecords: AttendanceRecord[],
  meetingDays?: number[],
): SubjectEvaluation {
  const dates = heldDates(allRecords, meetingDays);
  const filter =
    meetingDays && meetingDays.length > 0 ? new Set(meetingDays) : null;

  // slot → held? and student presence, per date
  const held = new Map<string, Set<Slot>>();
  const mine = new Map<string, Map<Slot, boolean>>();
  for (const r of allRecords) {
    if (filter && !filter.has(weekday(r.date))) continue;
    let slots = held.get(r.date);
    if (!slots) held.set(r.date, (slots = new Set()));
    slots.add(r.slot);
    if (r.studentId === studentId) {
      let m = mine.get(r.date);
      if (!m) mine.set(r.date, (m = new Map()));
      m.set(r.slot, r.present);
    }
  }

  const days: DayEvaluation[] = dates.map((date) => {
    const slots = [...(held.get(date) ?? [])].sort() as Slot[];
    const presence = mine.get(date);
    const presentIn = (s: Slot): boolean | null =>
      slots.includes(s) ? (presence?.get(s) ?? false) : null;
    const morning = presentIn('morning');
    const afternoon = presentIn('afternoon');
    const attended = slots.filter((s) => presence?.get(s) === true).length;
    const result: DayResult =
      attended === slots.length && slots.length > 0
        ? 'excellent'
        : attended > 0
          ? 'partial'
          : 'absent';
    return { date, heldSlots: slots, morning, afternoon, result };
  });

  const counts = { excellent: 0, partial: 0, absent: 0 };
  for (const d of days) counts[d.result] += 1;

  const totalDays = days.length;
  const attendedRatio =
    totalDays === 0 ? 0 : (counts.excellent + counts.partial) / totalDays;

  const overall: OverallResult =
    totalDays === 0
      ? 'pending'
      : counts.excellent === totalDays
        ? 'excellent'
        : attendedRatio >= PASS_MIN_RATIO
          ? 'pass'
          : 'fail';

  return { days, counts, totalDays, attendedRatio, overall };
}
