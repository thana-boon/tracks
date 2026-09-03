/**
 * ช่วงที่วิชาเสริมเปิดสอน — one ภาคเรียน (1|2) split into two ช่วง, so a year
 * holds four of them in a fixed order. A วิชา carries the pair on its
 * catalogue row; both null means nobody has placed it in a ช่วง yet, which is
 * how every วิชา created before this existed still reads.
 */
export const SEMESTERS = [1, 2] as const;
export const PHASES = [1, 2] as const;

/** every ช่วง of a year, in the order they are taught */
export const PHASE_SLOTS: { semester: number; phase: number; key: string }[] = SEMESTERS.flatMap(
  (semester) => PHASES.map((phase) => ({ semester, phase, key: `${semester}-${phase}` })),
);

/** the bucket a วิชา falls in — 'none' for one with no ช่วง yet */
export function phaseKey(semester: number | null, phase: number | null): string {
  return semester && phase ? `${semester}-${phase}` : 'none';
}

export function phaseLabel(semester: number | null, phase: number | null): string {
  if (!semester || !phase) return 'ยังไม่ระบุช่วง';
  return `ภาคเรียนที่ ${semester} · ช่วงที่ ${phase}`;
}

/** short form for a badge — "1/2" is เทอม 1 ช่วง 2 */
export function phaseShort(semester: number | null, phase: number | null): string | null {
  return semester && phase ? `${semester}/${phase}` : null;
}
