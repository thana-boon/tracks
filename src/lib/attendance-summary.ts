import type { DayResult } from './evaluate';

/**
 * เวลาเข้าเรียน — folding a student's class days into "มากี่ครั้ง ขาดกี่ครั้ง".
 *
 * Pure, and deliberately in its own module rather than inside `homeroom.ts`:
 * that file is `server-only` (it queries), and this arithmetic is the part a
 * ครูประจำชั้น reads off the screen and a parent asks about, so it is worth
 * being able to test in isolation — the same reason `evaluate.ts` is separate.
 */

/** One class date of one วิชาเสริม, as the report and the summary read it. */
export interface ReportDay {
  date: string;
  subjectCode: string;
  subjectName: string;
  sectionName: string;
  morning: boolean | null;
  afternoon: boolean | null;
  /** null = the day is scheduled but nobody has checked it yet */
  result: DayResult | null;
}

export interface ReportStudent {
  id: number;
  code: string;
  fullName: string;
  gradeLevel: string | null;
  classroom: string | null;
  classNumber: number | null;
}

export interface HomeroomReportEntry {
  student: ReportStudent;
  /** every scheduled class date of every subject the student sits, ascending */
  days: ReportDay[];
}

/** One วิชาเสริม a student sits, reduced to how often they turned up. */
export interface AttendanceLine {
  subjectCode: string;
  subjectName: string;
  sectionName: string;
  /** มาเต็มวัน */
  full: number;
  /** มาครึ่งวัน */
  partial: number;
  absent: number;
  /** scheduled but not checked yet */
  pending: number;
  /** days actually checked = full + partial + absent */
  held: number;
}

export interface AttendanceRow {
  student: ReportStudent;
  full: number;
  partial: number;
  absent: number;
  pending: number;
  held: number;
  /** (full + partial) / held; 0 when nothing has been checked */
  attendedRatio: number;
  /** per-subject breakdown, in the order the days list them */
  lines: AttendanceLine[];
}

/**
 * Counts per student across every วิชาเสริม they sit — the ห้อง-first question,
 * as opposed to `evaluateSubject`'s รอบเรียน-first one.
 *
 * A day nobody has checked counts as `pending`, never as an absence: the same
 * rule the evaluator uses, because a teacher who has not taken attendance yet
 * must not make a student look absent.
 *
 * Two รอบ of one วิชา stay separate lines — a student can only sit one of them,
 * but the subject code alone would not say which, and the day counts differ.
 */
export function summarizeAttendance(entries: HomeroomReportEntry[]): AttendanceRow[] {
  return entries.map((e) => {
    const byLine = new Map<string, AttendanceLine>();
    let full = 0;
    let partial = 0;
    let absent = 0;
    let pending = 0;

    for (const d of e.days) {
      const key = `${d.subjectCode}·${d.sectionName}`;
      const line =
        byLine.get(key) ??
        {
          subjectCode: d.subjectCode,
          subjectName: d.subjectName,
          sectionName: d.sectionName,
          full: 0,
          partial: 0,
          absent: 0,
          pending: 0,
          held: 0,
        };
      if (d.result === 'excellent') {
        line.full += 1;
        full += 1;
      } else if (d.result === 'partial') {
        line.partial += 1;
        partial += 1;
      } else if (d.result === 'absent') {
        line.absent += 1;
        absent += 1;
      } else {
        line.pending += 1;
        pending += 1;
      }
      line.held = line.full + line.partial + line.absent;
      byLine.set(key, line);
    }

    const held = full + partial + absent;
    return {
      student: e.student,
      full,
      partial,
      absent,
      pending,
      held,
      attendedRatio: held === 0 ? 0 : (full + partial) / held,
      lines: [...byLine.values()],
    };
  });
}
