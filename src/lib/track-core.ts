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
  /** สีของกลุ่มวิชา — a GROUP_COLORS key; the สาย is painted in it */
  groupColor: string | null;
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
  /** นักเรียนที่ถือสายนี้เปลี่ยนเองได้กี่ครั้ง — 0 = เลือกแล้วแก้ไม่ได้ */
  changeLimit: number;
  /** ผู้ดูแลเปิดให้นักเรียนแก้ไขอยู่หรือไม่ */
  changesOpen: boolean;
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
  color: string | null;
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

/**
 * Where a นักเรียน who cannot choose, or is unsure, should go — said on the
 * นักเรียน screen whatever state it is in. People rather than "ผู้ดูแลระบบ":
 * the person who can actually help a ม.4 decide is their ครูประจำชั้น, and the
 * one who can move them is ฝ่ายวิชาการ.
 */
export const ADVICE_NOTE =
  'หากเลือกไม่ได้ หรือต้องการคำปรึกษา ให้ปรึกษาครูประจำชั้น หรือติดต่อฝ่ายวิชาการ';

/** The most changes a สาย may allow — beyond this a limit is no limit at all. */
export const MAX_CHANGE_LIMIT = 10;

/** The limit a สาย carries, in the words the นักเรียน reads before choosing it. */
export function changeLimitLabel(limit: number): string {
  return limit > 0 ? `เลือกแล้วแก้ไขได้ ${limit} ครั้ง` : 'เลือกแล้วแก้ไขไม่ได้';
}

/**
 * Why a นักเรียน may not change the สาย they hold right now, or null if they may.
 *
 * 'none' — the สาย never allowed a change; 'used' — they have spent them all;
 * 'frozen' — the ผู้ดูแล has closed editing; 'after' — the สาย's ปิดรับ has
 * passed, and a deadline for choosing is a deadline for changing too.
 */
export type ChangeBlock = 'none' | 'used' | 'frozen' | 'after';

export interface ChangeStanding {
  limit: number;
  used: number;
  left: number;
  blocked: ChangeBlock | null;
}

/**
 * Whether the holder of a สาย may change it themselves — read off the สาย they
 * hold, not the one they are moving to: its limit is the number they agreed
 * to when they chose it. Whether the new สาย will *take* them is a separate
 * question (its own switch, window and ระดับชั้น), asked by the action.
 */
export function changeStanding(
  held: {
    changeLimit: number;
    changesOpen: boolean;
    opensAt: string | null;
    closesAt: string | null;
    active: boolean;
  },
  used: number,
  now: Date = new Date(),
): ChangeStanding {
  const limit = held.changeLimit;
  const left = Math.max(0, limit - used);
  const blocked: ChangeBlock | null =
    limit <= 0
      ? 'none'
      : left === 0
        ? 'used'
        : !held.changesOpen
          ? 'frozen'
          : trackWindow(held, now).state === 'after'
            ? 'after'
            : null;
  return { limit, used, left, blocked };
}

/** The line a นักเรียน reads under their choice — how many changes they have. */
export function changeNote(s: ChangeStanding): string {
  switch (s.blocked) {
    case 'none':
      return 'เลือกแล้วแก้ไขไม่ได้';
    case 'used':
      return `ใช้สิทธิ์แก้ไขครบ ${s.limit} ครั้งแล้ว`;
    case 'frozen':
      return `ขณะนี้ปิดการแก้ไข — คุณยังแก้ได้อีก ${s.left} ครั้ง เมื่อเปิดอีกครั้ง`;
    case 'after':
      return 'หมดเวลาแก้ไขแล้ว';
    default:
      return `คุณแก้ไขได้อีก ${s.left} ครั้ง (จากทั้งหมด ${s.limit} ครั้ง)`;
  }
}

/**
 * Whether a choice as it stands now was put there by a ผู้ดูแล — the last hand
 * on it decides. A นักเรียน who changes their own mind after being placed is
 * back to "เลือกเอง".
 */
export function choiceByAdmin(chosenBy: string, changedBy: string | null): boolean {
  return (changedBy ?? chosenBy).startsWith('admin:');
}

/** เวลาที่เหลือ แยกเป็นช่อง — what the นับถอยหลัง box shows. */
export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function countdownParts(ms: number): CountdownParts {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

/**
 * เวลาที่เหลือ in one line, for a row. Seconds only once the days are gone:
 * "3 วัน 4 ชั่วโมง 12 วินาที" ticking is noise, "12 นาที 30 วินาที" is the point.
 */
export function countdownText(ms: number): string {
  if (ms <= 0) return 'หมดเวลาแล้ว';
  const { days, hours, minutes, seconds } = countdownParts(ms);
  if (days) return `${days} วัน ${hours} ชั่วโมง ${minutes} นาที`;
  if (hours) return `${hours} ชั่วโมง ${minutes} นาที ${seconds} วินาที`;
  if (minutes) return `${minutes} นาที ${seconds} วินาที`;
  return `${seconds} วินาที`;
}

/** How loudly to say it — under a day is worth noticing, under an hour is urgent. */
export type CountdownUrgency = 'calm' | 'soon' | 'urgent';

export function countdownUrgency(ms: number): CountdownUrgency {
  return ms < 3_600_000 ? 'urgent' : ms < 86_400_000 ? 'soon' : 'calm';
}
