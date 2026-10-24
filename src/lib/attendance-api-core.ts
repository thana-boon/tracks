/**
 * เช็คชื่อจากระบบอื่น — the pure half of POST /api/public/v1/attendance.
 *
 * The other system knows a นักเรียน by รหัสนักเรียน, not by our ids, and it
 * usually does not know which รอบเรียน they sit in either: a scanner at the door
 * only knows who walked past it. So each record is resolved here against the
 * day's enrolment — the one รอบเรียน that student is registered in among those
 * meeting on that date. Kept free of the db so the rules can be tested alone.
 */

export interface IncomingRecord {
  studentCode?: string;
  studentId?: number;
  present: boolean;
}

/** One นักเรียน registered in one รอบเรียน that meets on the date. */
export interface Enrolment {
  studentId: number;
  code: string;
  sectionId: number;
}

export type RejectReason = 'unknown_student' | 'not_enrolled' | 'ambiguous_section';

export interface Rejected {
  studentCode: string | null;
  studentId: number | null;
  reason: RejectReason;
  message: string;
}

export interface Resolved {
  studentId: number;
  sectionId: number;
  present: boolean;
}

const MESSAGE: Record<RejectReason, string> = {
  unknown_student: 'ไม่พบนักเรียนรหัสนี้ในระบบวิชาเสริม',
  not_enrolled: 'นักเรียนคนนี้ไม่มีวิชาเสริมที่เรียนในวันนี้',
  ambiguous_section: 'นักเรียนคนนี้มีมากกว่า 1 กลุ่มเรียนในวันนี้ — ส่ง sectionId มาด้วย',
};

/**
 * Match every record to the รอบเรียน it belongs to.
 *
 * `enrolments` is already narrowed to the sections that meet on the date (and
 * to the one `sectionId` the caller named, if it named one). `knownCodes` and
 * `knownIds` are every นักเรียน this app holds, so that a รหัส nobody has ever
 * heard of reads differently from a นักเรียน who simply has no class that day.
 *
 * The same นักเรียน sent twice keeps the last record — a scanner that saw
 * someone leave and come back means the later reading.
 */
export function resolveRecords(
  records: IncomingRecord[],
  enrolments: Enrolment[],
  known: { codes: Set<string>; ids: Set<number> },
): { resolved: Resolved[]; rejected: Rejected[] } {
  const byCode = new Map<string, Enrolment[]>();
  const byId = new Map<number, Enrolment[]>();
  for (const e of enrolments) {
    byCode.set(e.code, [...(byCode.get(e.code) ?? []), e]);
    byId.set(e.studentId, [...(byId.get(e.studentId) ?? []), e]);
  }

  const resolved = new Map<string, Resolved>();
  const rejected: Rejected[] = [];

  for (const r of records) {
    const code = r.studentCode?.trim() || null;
    const id = r.studentId ?? null;
    const reject = (reason: RejectReason) =>
      rejected.push({ studentCode: code, studentId: id, reason, message: MESSAGE[reason] });

    const isKnown = (code !== null && known.codes.has(code)) || (id !== null && known.ids.has(id));
    if (!isKnown) {
      reject('unknown_student');
      continue;
    }

    const found = id !== null ? (byId.get(id) ?? []) : (byCode.get(code!) ?? []);
    if (found.length === 0) reject('not_enrolled');
    else if (found.length > 1) reject('ambiguous_section');
    else {
      const e = found[0];
      resolved.set(`${e.sectionId}:${e.studentId}`, {
        studentId: e.studentId,
        sectionId: e.sectionId,
        present: r.present,
      });
    }
  }

  return { resolved: [...resolved.values()], rejected };
}
