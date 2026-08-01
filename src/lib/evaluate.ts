/**
 * ผลการเรียนวิชาเสริม — computed purely from attendance records (spec §4.5).
 *
 * This module is a pure function of its inputs: no DB, no dates-from-clock, no
 * UI. That is deliberate — it is the heart of the system and must be testable
 * in isolation (`npm test`).
 *
 * Model
 * ─────
 * A subject meets on named calendar dates (subject_dates) — one day, or three
 * or four, chosen when the subject is set up. Each class date has two slots:
 * morning and afternoon. A slot on a date counts as "held" when at least one
 * attendance record exists for it — a slot the teacher never checked is not
 * held and cannot count against anyone.
 *
 * Per held date, per student (spec table):
 *   present in every held slot          → excellent  (มาเต็มวัน — ยอดเยี่ยม)
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
  excellent: 'มาเต็มวัน',
  partial: 'มาครึ่งวัน',
  absent: 'ไม่มา',
};

/**
 * The grade a single class day earns once both slots have been checked — the
 * wording the check-in screen shows back to the teacher. Same three buckets as
 * DAY_RESULT_LABEL, phrased as the outcome rather than as the attendance.
 */
export const DAY_OUTCOME_LABEL: Record<DayResult, string> = {
  excellent: 'ยอดเยี่ยม',
  partial: 'ผ่าน',
  absent: 'ไม่ผ่าน',
};

/** Day grade from one day's two slots; null = slot not checked. */
export function dayOutcome(morning: boolean | null, afternoon: boolean | null): DayResult {
  const slots = [morning, afternoon].filter((v) => v !== null) as boolean[];
  if (slots.length === 0) return 'absent';
  const attended = slots.filter(Boolean).length;
  return attended === slots.length ? 'excellent' : attended > 0 ? 'partial' : 'absent';
}

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

/**
 * Distinct held dates for a subject, sorted ascending. When the subject has a
 * declared schedule, records on dates outside it are ignored (a stray record on
 * a day the subject does not meet must not change anyone's result); with no
 * declared schedule every checked date counts.
 */
export function heldDates(
  records: Pick<AttendanceRecord, 'date'>[],
  scheduledDates?: string[],
): string[] {
  const filter =
    scheduledDates && scheduledDates.length > 0 ? new Set(scheduledDates) : null;
  const dates = new Set<string>();
  for (const r of records) {
    if (filter && !filter.has(r.date)) continue;
    dates.add(r.date);
  }
  return [...dates].sort();
}

/**
 * A section's attendance folded once, so evaluating N students costs one pass
 * over the records plus O(dates) each — not one full pass per student.
 *
 * Reading a whole ชั้น (or every ศิษย์เก่า) evaluates the same section for
 * dozens of students; doing the fold per student made the transcript export
 * quadratic in roster size, which is what made a big print sit there.
 */
export interface PreparedSection {
  /** the section's declared schedule, ascending — including dates nobody checked */
  scheduledDates: string[];
  /** held dates, ascending */
  dates: string[];
  /** date → slots actually held, sorted */
  slotsByDate: Map<string, Slot[]>;
  /** studentId → date → slot → present */
  byStudent: Map<number, Map<string, Map<Slot, boolean>>>;
}

/** Fold one section's records once; see PreparedSection. */
export function prepareSection(
  allRecords: AttendanceRecord[],
  scheduledDates?: string[],
): PreparedSection {
  const filter =
    scheduledDates && scheduledDates.length > 0 ? new Set(scheduledDates) : null;

  const held = new Map<string, Set<Slot>>();
  const byStudent = new Map<number, Map<string, Map<Slot, boolean>>>();
  for (const r of allRecords) {
    if (filter && !filter.has(r.date)) continue;
    let slots = held.get(r.date);
    if (!slots) held.set(r.date, (slots = new Set()));
    slots.add(r.slot);

    let dates = byStudent.get(r.studentId);
    if (!dates) byStudent.set(r.studentId, (dates = new Map()));
    let m = dates.get(r.date);
    if (!m) dates.set(r.date, (m = new Map()));
    m.set(r.slot, r.present);
  }

  const dates = [...held.keys()].sort();
  const slotsByDate = new Map<string, Slot[]>();
  for (const [date, slots] of held) slotsByDate.set(date, [...slots].sort() as Slot[]);
  return { scheduledDates: scheduledDates ?? [], dates, slotsByDate, byStudent };
}

/** One student's result, read off an already-folded section. */
export function evaluatePrepared(
  studentId: number,
  prepared: PreparedSection,
): SubjectEvaluation {
  const mine = prepared.byStudent.get(studentId);

  const days: DayEvaluation[] = prepared.dates.map((date) => {
    const slots = prepared.slotsByDate.get(date) ?? [];
    const presence = mine?.get(date);
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

/**
 * Evaluate one student in one subject from the subject's full attendance
 * records (all students — needed to know which slots were held).
 *
 * For more than one student in the same section, fold once with
 * `prepareSection` and call `evaluatePrepared` per student instead.
 */
export function evaluateSubject(
  studentId: number,
  allRecords: AttendanceRecord[],
  scheduledDates?: string[],
): SubjectEvaluation {
  return evaluatePrepared(studentId, prepareSection(allRecords, scheduledDates));
}
