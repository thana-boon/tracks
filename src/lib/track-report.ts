/**
 * รายงานสรุปการเลือก Track — the shaping, kept pure.
 *
 * Four questions the ผู้ดูแล asks of one ภาคเรียน, and this file answers all
 * four off a single pass over the students: who chose what, how many are in
 * each สาย, who exactly is in each สาย, and which ห้อง is still not finished.
 * Nothing here touches the database (the query lives in tracks.ts) so the
 * numbers on the screen and the numbers in the .xlsx come out of the same
 * function rather than out of two that have to be kept agreeing.
 */
import type { Sheet } from './xlsx';
import { RANK_COUNT, type Term, type TrackRow } from './track-core';

export interface ReportStudent {
  id: number;
  code: string;
  fullName: string;
  nickname: string | null;
  gradeLevel: string | null;
  classroom: string | null;
  classNumber: number | null;
  trackId: number | null;
  trackName: string | null;
  optionId: number | null;
  optionName: string | null;
  /** อันดับข้อย่อยที่นักเรียนจัดเอง — option ids, อันดับ 1 first */
  ranked: number[];
  /** an admin set or moved this choice — an exception, and shown as one */
  byAdmin: boolean;
}

export interface OptionTally {
  id: number;
  name: string;
  /** ผู้ที่ผู้ดูแลจัดให้ได้ข้อย่อยนี้ */
  count: number;
  /** ผู้ที่จัดข้อย่อยนี้เป็นอันดับ 1, 2, 3 — index 0 is อันดับ 1 */
  byRank: number[];
}

export interface TrackTally {
  id: number;
  name: string;
  active: boolean;
  gradeLevels: string[];
  total: number;
  /** empty when the สาย has no แขนง */
  options: OptionTally[];
  /** เปิดให้จัดอันดับข้อย่อยอยู่หรือไม่ */
  rankingOpen: boolean;
  /** ผู้ถือสายนี้ที่จัดอันดับข้อย่อยแล้ว — 0 on a สาย with no ข้อย่อย */
  ranked: number;
  /** ผู้ถือสายนี้ที่ยังไม่จัดอันดับ — empty on a สาย with no ข้อย่อย */
  unranked: ReportStudent[];
  /** ระดับชั้น that actually chose it, in ชั้น order */
  byGrade: { grade: string; count: number }[];
  students: ReportStudent[];
}

export interface RoomTally {
  gradeLevel: string;
  classroom: string;
  total: number;
  chosen: number;
  pending: number;
  /** count per track id — only the tracks this ห้อง actually chose */
  byTrack: { trackId: number; trackName: string; count: number }[];
}

export interface TrackReport {
  term: Term;
  /** ระดับชั้นที่เปิดรับในภาคเรียนนี้ — null when some สาย is open to every ชั้น */
  gradeLevels: string[] | null;
  students: ReportStudent[];
  tracks: TrackTally[];
  rooms: RoomTally[];
  totals: { students: number; chosen: number; pending: number };
  /** chose nothing yet — the list the ผู้ดูแล chases */
  pending: ReportStudent[];
}

/** "ม.4/2" — the label a ห้อง is known by, and what the sheets sort on. */
export function roomLabel(s: { gradeLevel: string | null; classroom: string | null }): string {
  return `${s.gradeLevel ?? '—'}/${s.classroom ?? '—'}`;
}

function byThai(a: string, b: string): number {
  return a.localeCompare(b, 'th', { numeric: true });
}

/**
 * The ชั้น the ภาคเรียน's สาย are open to, in ชั้น order — null when any one of
 * them is open to every ชั้น (an empty gradeLevels), since then nobody is out.
 */
export function openGrades(tracks: { gradeLevels: string[] }[]): string[] | null {
  if (tracks.some((t) => t.gradeLevels.length === 0)) return null;
  return [...new Set(tracks.flatMap((t) => t.gradeLevels))].sort(byThai);
}

/**
 * One report out of the rows for one ภาคเรียน. `students` arrives already
 * joined to its choice, and `tracks` is every สาย defined in the term — a สาย
 * nobody picked still belongs in the summary, as a zero, which is exactly the
 * fact the ผู้ดูแล is looking for when they open this.
 */
export function buildTrackReport(
  term: Term,
  tracks: TrackRow[],
  everyone: ReportStudent[],
): TrackReport {
  const gradeLevels = openGrades(tracks);
  // Only the ชั้น some สาย of this ภาคเรียน is open to: a ม.5 who was never
  // offered a Track is not "ยังไม่เลือก", and counting them drags every % down.
  // A choice already on record is kept whatever the ชั้น — an ผู้ดูแล may have
  // placed someone by hand, and a report that loses a chosen student lies.
  const students = gradeLevels
    ? everyone.filter(
        (s) =>
          (s.gradeLevel !== null && gradeLevels.includes(s.gradeLevel)) ||
          (s.trackId !== null && tracks.some((t) => t.id === s.trackId)),
      )
    : everyone;
  const tallies = new Map<number, TrackTally>(
    tracks.map((t) => [
      t.id,
      {
        id: t.id,
        name: t.name,
        active: t.active,
        gradeLevels: t.gradeLevels,
        total: 0,
        options: t.options.map((o) => ({
          id: o.id,
          name: o.name,
          count: 0,
          byRank: Array<number>(RANK_COUNT).fill(0),
        })),
        rankingOpen: t.rankingOpen,
        ranked: 0,
        unranked: [],
        byGrade: [],
        students: [],
      },
    ]),
  );
  const gradeCounts = new Map<number, Map<string, number>>();
  const rooms = new Map<string, RoomTally & { trackCounts: Map<number, number> }>();
  const pending: ReportStudent[] = [];

  for (const s of students) {
    const key = roomLabel(s);
    let room = rooms.get(key);
    if (!room) {
      room = {
        gradeLevel: s.gradeLevel ?? '—',
        classroom: s.classroom ?? '—',
        total: 0,
        chosen: 0,
        pending: 0,
        byTrack: [],
        trackCounts: new Map(),
      };
      rooms.set(key, room);
    }
    room.total++;

    const tally = s.trackId === null ? undefined : tallies.get(s.trackId);
    if (!tally) {
      // Either no choice, or a choice pointing at a สาย of another term — both
      // mean "not settled for this ภาคเรียน", and both belong on the chase list.
      room.pending++;
      pending.push(s);
      continue;
    }

    room.chosen++;
    room.trackCounts.set(tally.id, (room.trackCounts.get(tally.id) ?? 0) + 1);
    tally.total++;
    tally.students.push(s);
    if (s.optionId !== null) {
      const opt = tally.options.find((o) => o.id === s.optionId);
      if (opt) opt.count++;
    }
    s.ranked.forEach((id, i) => {
      const opt = tally.options.find((o) => o.id === id);
      if (opt && i < RANK_COUNT) opt.byRank[i]++;
    });
    if (tally.options.length) {
      if (s.ranked.length) tally.ranked++;
      else tally.unranked.push(s);
    }
    const grade = s.gradeLevel ?? '—';
    const grades = gradeCounts.get(tally.id) ?? new Map<string, number>();
    grades.set(grade, (grades.get(grade) ?? 0) + 1);
    gradeCounts.set(tally.id, grades);
  }

  const trackList = [...tallies.values()];
  for (const t of trackList) {
    t.byGrade = [...(gradeCounts.get(t.id) ?? new Map())]
      .map(([grade, count]) => ({ grade, count }))
      .sort((a, b) => byThai(a.grade, b.grade));
    t.students.sort(byRoomAndNumber);
    t.unranked.sort(byRoomAndNumber);
  }
  // Biggest สาย first — a summary is read for its shape, and the ranking is
  // the shape. Ties fall back to the name so the order never wobbles.
  trackList.sort((a, b) => b.total - a.total || byThai(a.name, b.name));

  const roomList = [...rooms.values()]
    .map((r) => ({
      gradeLevel: r.gradeLevel,
      classroom: r.classroom,
      total: r.total,
      chosen: r.chosen,
      pending: r.pending,
      byTrack: [...r.trackCounts]
        .map(([trackId, count]) => ({
          trackId,
          trackName: tallies.get(trackId)?.name ?? '—',
          count,
        }))
        .sort((a, b) => b.count - a.count || byThai(a.trackName, b.trackName)),
    }))
    .sort((a, b) => byThai(a.gradeLevel, b.gradeLevel) || byThai(a.classroom, b.classroom));

  const chosen = students.length - pending.length;
  return {
    term,
    gradeLevels,
    students,
    tracks: trackList,
    rooms: roomList,
    totals: { students: students.length, chosen, pending: pending.length },
    pending,
  };
}

function byRoomAndNumber(a: ReportStudent, b: ReportStudent): number {
  return (
    byThai(a.gradeLevel ?? '', b.gradeLevel ?? '') ||
    byThai(a.classroom ?? '', b.classroom ?? '') ||
    (a.classNumber ?? 0) - (b.classNumber ?? 0)
  );
}

// ── the workbook ─────────────────────────────────────────────

const PERSON_HEADER = ['รหัส', 'ชื่อ-สกุล', 'ชื่อเล่น', 'ชั้น', 'ห้อง', 'เลขที่'];
const PERSON_WIDTHS = [10, 30, 12, 8, 8, 8];

function personCells(s: ReportStudent) {
  return [
    s.code,
    s.fullName,
    s.nickname ?? '',
    s.gradeLevel ?? '',
    s.classroom ?? '',
    s.classNumber ?? '',
  ];
}

/** Which reading of the report to export — the page's tabs, or all of them. */
export type ReportPart = 'all' | 'tracks' | 'rooms' | 'students' | 'ranking';

export const REPORT_PARTS: { id: ReportPart; label: string }[] = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'tracks', label: 'แยกตาม Track' },
  { id: 'rooms', label: 'แยกตามห้อง' },
  { id: 'students', label: 'รายบุคคล' },
  { id: 'ranking', label: 'จัดอันดับข้อย่อย' },
];

/** A part out of a query string — anything unknown is the whole report. */
export function parseReportPart(v: string | null): ReportPart {
  return REPORT_PARTS.some((p) => p.id === v) ? (v as ReportPart) : 'all';
}

/**
 * The sheets the ดาวน์โหลด buttons hand over: one sheet per question, then
 * one sheet per สาย so a หัวหน้าสาย can be sent their own tab without anyone
 * having to filter anything. `part` keeps it to the sheets behind one tab of
 * the page; the .xlsx and the PDF are both built from what comes back.
 */
export function reportSheets(report: TrackReport, part: ReportPart = 'all'): Sheet[] {
  const { tracks, rooms, totals } = report;
  const optionName = new Map(tracks.flatMap((t) => t.options.map((o) => [o.id, o.name] as const)));
  const rankHeader = Array.from({ length: RANK_COUNT }, (_, i) => `สนใจอันดับ ${i + 1}`);
  const rankWidths = rankHeader.map(() => 18);
  const rankCells = (s: ReportStudent) =>
    rankHeader.map((_, i) => (s.ranked[i] ? (optionName.get(s.ranked[i]) ?? '') : ''));

  const everyone: Sheet = {
    name: 'รายบุคคล',
    header: [...PERSON_HEADER, 'Track', 'ข้อย่อย', ...rankHeader, 'สถานะ'],
    widths: [...PERSON_WIDTHS, 24, 20, ...rankWidths, 14],
    rows: report.students.map((s) => [
      ...personCells(s),
      s.trackName ?? '',
      s.optionName ?? '',
      ...rankCells(s),
      s.trackName ? (s.byAdmin ? 'ผู้ดูแลกำหนด' : 'เลือกเอง') : 'ยังไม่เลือก',
    ]),
  };

  const counts: Sheet = {
    name: 'สรุปจำนวนแต่ละ Track',
    header: [
      'Track',
      'ข้อย่อย',
      'จำนวน (คน)',
      'สัดส่วนผู้เลือก',
      'ระดับชั้นที่เลือก',
      'สถานะ',
      ...rankHeader,
    ],
    widths: [24, 20, 14, 16, 26, 14, ...rankWidths],
    rows: [],
  };
  for (const t of tracks) {
    const share = totals.chosen ? Math.round((t.total / totals.chosen) * 1000) / 10 : 0;
    counts.rows.push([
      t.name,
      t.options.length ? 'รวมทุกข้อย่อย' : '',
      t.total,
      `${share}%`,
      t.byGrade.map((g) => `${g.grade} ${g.count}`).join(', '),
      t.active ? 'เปิดให้เลือก' : 'ปิดไม่ให้เลือก',
    ]);
    // ข้อย่อย indented under their สาย rather than given their own sheet: the
    // แขนง only means anything next to the สาย it splits.
    // The อันดับ columns count who *asked* for the ข้อย่อย; จำนวน counts who
    // the ผู้ดูแล has placed in it.
    for (const o of t.options) counts.rows.push(['', o.name, o.count, '', '', '', ...o.byRank]);
  }
  counts.rows.push([]);
  counts.rows.push(['รวมนักเรียนทั้งหมด', '', totals.students, '', '', '']);
  counts.rows.push(['เลือกแล้ว', '', totals.chosen, '', '', '']);
  counts.rows.push(['ยังไม่เลือก', '', totals.pending, '', '', '']);

  // ห้อง × Track, one column per สาย — the shape a ครูที่ปรึกษา reads across.
  const byRoom: Sheet = {
    name: 'สรุปตามห้อง',
    header: ['ชั้น', 'ห้อง', 'นักเรียน', 'เลือกแล้ว', 'ยังไม่เลือก', ...tracks.map((t) => t.name)],
    widths: [8, 8, 10, 12, 12, ...tracks.map(() => 14)],
    rows: rooms.map((r) => [
      r.gradeLevel,
      r.classroom,
      r.total,
      r.chosen,
      r.pending,
      ...tracks.map((t) => r.byTrack.find((x) => x.trackId === t.id)?.count ?? 0),
    ]),
  };

  const stillPending: Sheet = {
    name: 'ยังไม่เลือก',
    header: PERSON_HEADER,
    widths: PERSON_WIDTHS,
    rows: report.pending.map(personCells),
  };

  const rosters: Sheet[] = tracks.map((t) => ({
    name: t.name,
    header: [...PERSON_HEADER, 'ข้อย่อย', ...(t.options.length ? rankHeader : []), 'สถานะ'],
    widths: [...PERSON_WIDTHS, 20, ...(t.options.length ? rankWidths : []), 14],
    rows: t.students.map((s) => [
      ...personCells(s),
      s.optionName ?? '',
      ...(t.options.length ? rankCells(s) : []),
      s.byAdmin ? 'ผู้ดูแลกำหนด' : 'เลือกเอง',
    ]),
  }));

  // The จัดอันดับข้อย่อย sheets — only when some สาย has ข้อย่อย to rank.
  const ranking = tracks.filter((t) => t.options.length);
  const rankSheets: Sheet[] = ranking.length
    ? [
        {
          name: 'สรุปการจัดอันดับข้อย่อย',
          header: ['Track', 'ข้อย่อย', 'จัดแล้ว', 'ยังไม่จัด', ...rankHeader],
          widths: [24, 20, 10, 10, ...rankWidths],
          rows: ranking.flatMap((t) => [
            [t.name, 'รวมทุกข้อย่อย', t.ranked, t.unranked.length],
            ...[...t.options]
              .sort((a, b) => b.byRank[0] - a.byRank[0] || b.byRank[1] - a.byRank[1])
              .map((o) => ['', o.name, '', '', ...o.byRank]),
          ]),
        },
        {
          name: 'ยังไม่จัดอันดับข้อย่อย',
          header: ['Track', ...PERSON_HEADER],
          widths: [24, ...PERSON_WIDTHS],
          rows: ranking.flatMap((t) => t.unranked.map((s) => [t.name, ...personCells(s)])),
        },
      ]
    : [];

  switch (part) {
    case 'tracks':
      return [counts, ...rosters];
    case 'rooms':
      return [byRoom, stillPending];
    case 'students':
      return [everyone];
    case 'ranking':
      return rankSheets;
    default:
      return [everyone, counts, byRoom, stillPending, ...rankSheets, ...rosters];
  }
}

/** `Track-2569-เทอม1-แยกตามห้อง.pdf` — sortable, and safe on every filesystem. */
export function reportFileName(term: Term, part: ReportPart, ext: 'xlsx' | 'pdf'): string {
  const label = part === 'all' ? '' : `-${REPORT_PARTS.find((p) => p.id === part)!.label}`;
  return `Track-${term.year}-เทอม${term.semester}${label}.${ext}`;
}
