import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * คำนำหน้าชื่อ that must not be mistaken for the name itself — "นายชรินทร์"
 * has to yield "ช", not "น". Longest first so "นางสาว" wins over "นาง".
 */
const NAME_PREFIXES = [
  'เด็กชาย', 'เด็กหญิง', 'นางสาว', 'นาง', 'นาย', 'ด.ช.', 'ด.ญ.', 'น.ส.',
  'ว่าที่ร้อยตรี', 'ว่าที่ ร.ต.', 'ดร.', 'Master', 'Mrs.', 'Miss', 'Mr.', 'Ms.',
];

/** The letter an avatar shows when there is no photo: ตัวแรกของชื่อจริง. */
export function initialOf(name: string | null | undefined): string {
  let s = String(name ?? '').trim();
  for (const p of NAME_PREFIXES) {
    if (s.startsWith(p)) {
      s = s.slice(p.length).trim();
      break;
    }
  }
  return s.charAt(0) || 'ผ';
}

/** Thai grade ordering key: อนุบาล < ประถม < มัธยม, then by number. */
export function gradeKey(g: string | null): number {
  const m = /^(อ|ป|ม)\.?\s*(\d+)/.exec(g ?? '');
  const order: Record<string, number> = { อ: 0, ป: 1, ม: 2 };
  return m ? order[m[1]] * 100 + Number(m[2]) : 999;
}

/** Distinct, grade-ordered list of non-empty grade labels. */
export function sortGrades(grades: (string | null)[]): string[] {
  return [...new Set(grades.filter(Boolean) as string[])].sort(
    (a, b) => gradeKey(a) - gradeKey(b),
  );
}

/** gradeKey of the ชั้น named anywhere in a label; 999 when there is none. */
function gradeInLabel(label: string): number {
  const m = /(?:^|[\s([-])([อปม])\.?\s*(\d+)/.exec(label);
  return m ? gradeKey(`${m[1]}.${m[2]}`) : 999;
}

/**
 * ชั้น/กลุ่ม order for a รอบเรียน label: "ม.4 กลุ่มเรียนที่ 1" → "ม.4 กลุ่มเรียนที่ 2"
 * → "ม.5 กลุ่มเรียนที่ 1", which is the order a teacher reads a room list in.
 *
 * The ชั้น is pulled out first so it outranks the rest of the label however the
 * รอบ was named — "รอบบ่าย ม.5" belongs with ม.5, not under ร — and what is left
 * is compared with Thai numeric collation so กลุ่ม 10 lands after กลุ่ม 2 rather
 * than after กลุ่ม 1. A label with no ชั้น in it (a รอบ named after its date)
 * keeps to the end, in its own order.
 */
export function compareClassLabels(a: string, b: string): number {
  return gradeInLabel(a) - gradeInLabel(b) || a.localeCompare(b, 'th', { numeric: true });
}

/**
 * How เช็คชื่อ, ผลเช็คชื่อ and พิมพ์ใบเช็คชื่อ order รอบเรียน — by the ชั้น/กลุ่ม
 * on the label first, and only then by หมวด and วิชา.
 *
 * These three screens are read the other way round from the register: the
 * teacher already knows which room is in front of them and is hunting for its
 * line, so ordering by วิชา first left ม.4 and ม.5 interleaved down the list and
 * every print run had to be checked line by line.
 */
export function byClassOrder<T extends { name: string; groupCode: string; subjectCode: string }>(
  a: T,
  b: T,
): number {
  return (
    compareClassLabels(a.name, b.name) ||
    a.groupCode.localeCompare(b.groupCode, 'th', { numeric: true }) ||
    a.subjectCode.localeCompare(b.subjectCode, 'th', { numeric: true })
  );
}

/** The three grades this system serves — วิชาเสริมมีเฉพาะ ม.ปลาย. */
export const TRACK_GRADES = ['ม.4', 'ม.5', 'ม.6'];

/**
 * Is this grade one this system serves?
 *
 * Parsed rather than compared against TRACK_GRADES as strings: the label
 * reaches us from the Users Service, a sync, and a URL, and "ม4" / "ม. 4" all
 * mean ม.4. A membership test on the exact string would let a login through or
 * refuse one on a missing full stop, which is not a decision anyone intended.
 */
export function isTrackGrade(grade: string | null | undefined): boolean {
  const key = gradeKey(grade ?? null);
  return TRACK_GRADES.some((g) => gradeKey(g) === key);
}

/**
 * Dates are entered and read back as local school time, so every conversion
 * pins Asia/Bangkok explicitly rather than trusting the server's clock —
 * containers run in UTC and would otherwise shift a class date by seven hours.
 */
export const SCHOOL_TZ = 'Asia/Bangkok';

/** "YYYY-MM-DD" for a date, read in school time. */
export function toSchoolDate(d: Date | null | undefined): string {
  if (!d) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHOOL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** "HH:MM" (24h) for a date, read in school time. */
export function toSchoolTime(d: Date | null | undefined): string {
  if (!d) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: SCHOOL_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

/** 0 = อาทิตย์ … 6 = เสาร์ — matches JS getUTCDay(). */
export const THAI_WEEKDAYS = [
  'อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์',
];
export const THAI_WEEKDAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

/**
 * "27 มกราคม 2569" from a plain calendar day ("YYYY-MM-DD"). Read as digits
 * rather than through `new Date()` — parsing as a Date would place it at UTC
 * midnight, the *previous* day in school time.
 */
export function thaiDateLong(ymd: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? '').trim());
  if (!m) return '';
  const [, y, mo, d] = m;
  const month = THAI_MONTHS[Number(mo) - 1];
  if (!month) return '';
  return `${Number(d)} ${month} ${Number(y) + 543}`;
}

/** "มกราคม 2569" from a "YYYY-MM" month key. */
export function thaiMonthLabel(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym ?? '').trim());
  if (!m) return '';
  const month = THAI_MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[1]) + 543}` : '';
}

/** "27 ม.ค. 69" — compact form for table headers. */
export function thaiDateShort(ymd: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? '').trim());
  if (!m) return '';
  const [, y, mo, d] = m;
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const month = months[Number(mo) - 1];
  if (!month) return '';
  return `${Number(d)} ${month} ${String(Number(y) + 543).slice(-2)}`;
}

/** "15 มกราคม 2569" for an instant, read in school time. */
export function thaiDateLongOf(d: Date | null | undefined): string {
  return thaiDateLong(toSchoolDate(d));
}

/** "15 มกราคม 2569 09:30" — the stamp printed in a document footer. */
export function thaiDateTimeLongOf(d: Date | null | undefined): string {
  const date = thaiDateLongOf(d);
  return date ? `${date} ${toSchoolTime(d)}` : '';
}

/**
 * "3 นาทีที่แล้ว" / "อีก 2 ชั่วโมง" — how long ago (or ahead) an instant is,
 * for status lines where the exact stamp is noise. Falls back to the full date
 * past a week, when "8 วันที่แล้ว" stops being easier to read than the date.
 */
export function thaiRelativeTime(d: Date | null | undefined, now: Date = new Date()): string {
  if (!d) return '—';
  const ms = d.getTime() - now.getTime();
  const abs = Math.abs(ms);
  const ahead = ms > 0;
  const say = (n: number, unit: string) => (ahead ? `อีก ${n} ${unit}` : `${n} ${unit}ที่แล้ว`);

  if (abs < 60_000) return ahead ? 'อีกไม่ถึงนาที' : 'เมื่อสักครู่';
  if (abs < 3_600_000) return say(Math.round(abs / 60_000), 'นาที');
  if (abs < 86_400_000) return say(Math.round(abs / 3_600_000), 'ชั่วโมง');
  if (abs < 7 * 86_400_000) return say(Math.round(abs / 86_400_000), 'วัน');
  return thaiDateTimeLongOf(d);
}

/** Weekday index (0=Sun…6=Sat) of a "YYYY-MM-DD", timezone-proof. */
export function weekdayOfYmd(ymd: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return -1;
  const [, y, mo, d] = m.map(Number);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

/** "YYYY-MM-DD" from calendar parts (month is 1-12). */
export function ymd(year: number, month: number, day: number): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(year, 4)}-${p(month)}-${p(day)}`;
}

/**
 * Days in a month grid: every date of the month, preceded by the blanks needed
 * to line the 1st up under its weekday column. Used by the Thai calendar.
 */
export function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const lead = first.getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => ymd(year, month, i + 1)),
  ];
}

/** Today as "YYYY-MM-DD" in school time. */
export function todayYmd(): string {
  return toSchoolDate(new Date());
}

/** Validate a "YYYY-MM-DD" string, returning it normalized or null. */
export function normalizeYmd(input: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(input ?? '').trim());
  if (!m) return null;
  let [, y, mo, d] = m.map(Number);
  if (y > 2400) y -= 543; // พ.ศ. → ค.ศ.
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(y, 4)}-${p(mo)}-${p(d)}`;
}
