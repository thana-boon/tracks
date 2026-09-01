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
  active: boolean;
  options: TrackOptionRow[];
}

/** Whether a student of this ชั้น may choose the track. Empty list = every ชั้น. */
export function trackAllows(track: { gradeLevels: string[] }, gradeLevel: string | null): boolean {
  return track.gradeLevels.length === 0 || (!!gradeLevel && track.gradeLevels.includes(gradeLevel));
}
