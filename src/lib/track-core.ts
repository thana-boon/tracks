/**
 * Track (สายการเรียน) — the parts a browser may hold.
 *
 * Split from tracks.ts the same way session-core is split from session: the
 * ผู้ดูแล form and the นักเรียน chooser are client components, and importing the
 * query module into them would drag `server-only` (and the db handle) into the
 * bundle. Everything here is a constant, a type, or a pure function.
 */

/** ภาคเรียน the school runs. Two, and the number is not going to change. */
export const SEMESTERS = [1, 2] as const;

/** ระดับชั้น a Track can be offered to — วิชาเสริม is ม.4-6 only. */
export const GRADE_LEVELS = ['ม.4', 'ม.5', 'ม.6'] as const;

export interface Term {
  yearId: number;
  /** Thai Buddhist year as stored, e.g. "2569" */
  year: string;
  semester: number;
}

export function termLabel(t: Term): string {
  return `ปีการศึกษา ${t.year} ภาคเรียนที่ ${t.semester}`;
}

export function isSemester(n: unknown): n is number {
  return (SEMESTERS as readonly number[]).includes(n as number);
}

export interface TrackOptionRow {
  id: number;
  name: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
}

export interface TrackRow {
  id: number;
  yearId: number;
  semester: number;
  name: string;
  description: string | null;
  gradeLevels: string[];
  /** ISO instants, or null for "not fenced on that side" */
  opensAt: string | null;
  closesAt: string | null;
  active: boolean;
  options: TrackOptionRow[];
}

/**
 * ช่วงเวลาเปิดให้เลือก — where a Track stands against the clock right now.
 *
 * 'closed' is the ผู้ดูแล's switch and outranks the clock: a สาย turned off is
 * off whatever the window says, and saying so in one word keeps the นักเรียน
 * screen from promising "เปิด 1 มิ.ย." for something that will not open.
 */
export type TrackWindowState = 'closed' | 'before' | 'open' | 'after';

export interface TrackWindow {
  state: TrackWindowState;
  opensAt: Date | null;
  closesAt: Date | null;
}

export function trackWindow(
  track: { opensAt: string | null; closesAt: string | null; active: boolean },
  now: Date = new Date(),
): TrackWindow {
  const opensAt = track.opensAt ? new Date(track.opensAt) : null;
  const closesAt = track.closesAt ? new Date(track.closesAt) : null;
  const state: TrackWindowState = !track.active
    ? 'closed'
    : opensAt && now < opensAt
      ? 'before'
      : closesAt && now >= closesAt
        ? 'after'
        : 'open';
  return { state, opensAt, closesAt };
}

/** Whether a นักเรียน may choose this สาย at this moment — the switch and the clock together. */
export function trackChoosable(
  track: { opensAt: string | null; closesAt: string | null; active: boolean },
  now: Date = new Date(),
): boolean {
  return trackWindow(track, now).state === 'open';
}

/** Whether a student of this ชั้น may choose the track. Empty list = every ชั้น. */
export function trackAllows(track: { gradeLevels: string[] }, gradeLevel: string | null): boolean {
  return track.gradeLevels.length === 0 || (!!gradeLevel && track.gradeLevels.includes(gradeLevel));
}
