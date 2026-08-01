import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { people } from '@/db/schema';
import { buildTranscripts } from './transcript';

/**
 * นักเรียนที่ออกจากระบบไปแล้ว — จบการศึกษา หรือ ลาออก
 *
 * These are read-only from this app's point of view. They are never assigned a
 * subject and never checked in again; the pages that do those things all filter
 * on `status = 'studying'`, so a student drops out of them the moment the sync
 * records the change. What survives is the record itself — registrations and
 * attendance reference people with ON DELETE RESTRICT, so the history a
 * transcript is printed from cannot be removed out from under it.
 */

/** The two statuses the Users Service reports for a student who has left. */
export type AlumniStatus = 'graduated' | 'withdrawn';

export const ALUMNI_LABEL: Record<AlumniStatus, string> = {
  graduated: 'จบการศึกษา',
  withdrawn: 'ลาออก',
};

export interface AlumniRow {
  id: number;
  code: string;
  fullName: string;
  nickname: string | null;
  /** ชั้น/ห้องสุดท้ายที่มีข้อมูล — คงค่าไว้ตอน sync ไม่ทับด้วย null */
  gradeLevel: string | null;
  classroom: string | null;
  classNumber: number | null;
  /** วิชาที่ผ่านสะสมทุกปีการศึกษา — ตรงกับที่พิมพ์ลงทรานสคริปต์ */
  passedCount: number;
  /** ปีการศึกษาที่เคยเรียนวิชาเสริม เรียงจากน้อยไปมาก */
  years: string[];
}

/** รายชื่อ + สรุปผลสะสม เรียงตาม ชั้น → ห้อง → เลขที่ → รหัส */
export async function alumniOf(status: AlumniStatus): Promise<AlumniRow[]> {
  const rows = await db
    .select({
      id: people.id,
      code: people.code,
      fullName: people.fullName,
      nickname: people.nickname,
      gradeLevel: people.gradeLevel,
      classroom: people.classroom,
      classNumber: people.classNumber,
    })
    .from(people)
    .where(and(eq(people.type, 'student'), eq(people.status, status)))
    .orderBy(
      asc(people.gradeLevel),
      asc(people.classroom),
      asc(people.classNumber),
      asc(people.code),
    );

  if (rows.length === 0) return [];

  // buildTranscripts evaluates each section once and indexes by student, so one
  // call for the whole list costs far less than one call per row.
  const transcripts = await buildTranscripts(rows.map((r) => r.id));
  const byId = new Map(transcripts.map((t) => [t.student.id, t]));

  return rows.map((r) => ({
    ...r,
    passedCount: byId.get(r.id)?.passedCount ?? 0,
    years: byId.get(r.id)?.years ?? [],
  }));
}
