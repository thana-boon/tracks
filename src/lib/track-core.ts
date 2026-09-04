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

/**
 * A วิชา a สาย leads to, as the two screens show it.
 *
 * Copied out of the catalogue rather than linked to it: this is what the
 * นักเรียน reads on หน้ารายละเอียด before choosing, and the ผู้ดูแล previews
 * while setting the สาย up — neither needs anything the catalogue row does not
 * already say.
 */
export interface TrackSubjectRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  teacherName: string | null;
  semester: number | null;
  phase: number | null;
}

export interface TrackOptionRow {
  id: number;
  /** กลุ่มวิชาของแขนงนี้ — null when the แขนง has no วิชา of its own */
  groupId: number | null;
  groupName: string | null;
  name: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
  /** วิชาของแขนงนี้ในช่วงที่สายเปิด — empty when it has no กลุ่มวิชา */
  subjects: TrackSubjectRow[];
}

export interface TrackRow {
  id: number;
  yearId: number;
  semester: number;
  /** กลุ่มวิชาที่สายนี้พาไปเรียน — null on a Track made before the link existed */
  groupId: number | null;
  groupCode: string | null;
  groupName: string | null;
  /** ช่วงในภาคเรียน — 1, 2, or null for ทั้งภาคเรียน */
  phase: number | null;
  name: string;
  description: string | null;
  admissionNote: string | null;
  gradeLevels: string[];
  /** ISO instants, or null for "not fenced on that side" */
  opensAt: string | null;
  closesAt: string | null;
  active: boolean;
  options: TrackOptionRow[];
  /** วิชาที่นักเรียนจะได้เรียนถ้าเลือกสายนี้ */
  subjects: TrackSubjectRow[];
}

/**
 * กลุ่มวิชาหนึ่ง พร้อมวิชาในกลุ่ม — the catalogue the ผู้ดูแล picks a Track's
 * name and วิชา from. Declared here rather than beside the query because the
 * form that reads it is a client component.
 */
export interface GroupCatalogRow {
  id: number;
  code: string;
  name: string;
  description: string | null;
  subjects: TrackSubjectRow[];
}

/** ช่วงในภาคเรียนที่สายเปิด, in words — null is every ช่วง of that ภาคเรียน. */
export function trackPhaseLabel(phase: number | null): string {
  return phase ? `ช่วงที่ ${phase}` : 'ทั้งภาคเรียน';
}

/**
 * Whether a วิชา of the กลุ่ม belongs to this สาย — the ภาคเรียน must match,
 * and the ช่วง too unless the สาย runs ทั้งภาคเรียน.
 *
 * A วิชา that nobody has placed in a ช่วง yet is left out rather than shown
 * everywhere: the list is a promise about what the นักเรียน will be taught, and
 * "ยังไม่ระบุช่วง" is not one the school has made.
 */
export function subjectInTrack(
  track: { semester: number; phase: number | null },
  subject: { semester: number | null; phase: number | null },
): boolean {
  if (subject.semester === null || subject.phase === null) return false;
  if (subject.semester !== track.semester) return false;
  return track.phase === null || subject.phase === track.phase;
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
