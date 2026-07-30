import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { subjectDays, trackGroups, trackSubjects } from '@/db/schema';
import type { YearRow } from './years';

export interface SubjectForCheckIn {
  id: number;
  code: string;
  name: string;
  groupCode: string;
  meetingDays: number[];
}

/**
 * Active subjects available for attendance in a year, each with its meeting
 * weekdays. Any teacher may take any subject's attendance (spec §3), so this is
 * not scoped by teacher — the list is the same for admin and teacher.
 */
export async function subjectsForCheckIn(year: YearRow): Promise<SubjectForCheckIn[]> {
  const [subjects, days] = await Promise.all([
    db
      .select({
        id: trackSubjects.id,
        code: trackSubjects.code,
        name: trackSubjects.name,
        groupCode: trackGroups.code,
      })
      .from(trackSubjects)
      .innerJoin(trackGroups, eq(trackSubjects.groupId, trackGroups.id))
      .where(eq(trackSubjects.active, true))
      .orderBy(asc(trackGroups.code), asc(trackSubjects.code)),
    db
      .select({ subjectId: subjectDays.subjectId, dayOfWeek: subjectDays.dayOfWeek })
      .from(subjectDays)
      .where(eq(subjectDays.yearId, year.id)),
  ]);

  const daysBy = new Map<number, number[]>();
  for (const d of days) {
    const arr = daysBy.get(d.subjectId) ?? [];
    arr.push(d.dayOfWeek);
    daysBy.set(d.subjectId, arr);
  }

  return subjects.map((s) => ({ ...s, meetingDays: (daysBy.get(s.id) ?? []).sort() }));
}
