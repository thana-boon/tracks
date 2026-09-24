import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { trackGroups, trackSubjects } from '@/db/schema';
import { activeYear } from '@/lib/years';
import { checkedDayKeys, yearSchedule } from '@/lib/schedule';
import { listSections, studentCountsBySection } from '@/lib/data';
import { NeedYear } from '@/components/ui';
import {
  ScheduleManager,
  type ScheduleGroup,
  type ScheduleSection,
  type ScheduleSubject,
} from './schedule-manager';

export const metadata = { title: 'ตารางเรียนทั้งปี' };

/**
 * ตารางเรียนทั้งปี — every class day of the ปีการศึกษา as one long list of
 * วัน · วิชา · กลุ่มเรียน.
 *
 * จัดนักเรียนเข้าวิชา is organised the way a รอบเรียน is *set up* (open a วิชา,
 * see its กลุ่ม, tick a calendar); this screen is organised the way a year is
 * *read* (what happens on the 12th? when does ET101 meet all term?). Both are
 * views of the same `subject_dates` rows, so neither can go stale against the
 * other — a day added here shows up there, and a day ticked there shows up here.
 */
export default async function SchedulePage() {
  const year = await activeYear();
  if (!year) return <NeedYear />;

  const [rows, checked, subjects, sections, counts] = await Promise.all([
    yearSchedule(year.id),
    checkedDayKeys(year.id),
    db
      .select({
        id: trackSubjects.id,
        code: trackSubjects.code,
        name: trackSubjects.name,
        teacherName: trackSubjects.teacherName,
        semester: trackSubjects.semester,
        phase: trackSubjects.phase,
        groupId: trackSubjects.groupId,
        groupCode: trackGroups.code,
        groupName: trackGroups.name,
      })
      .from(trackSubjects)
      .innerJoin(trackGroups, eq(trackSubjects.groupId, trackGroups.id))
      .where(eq(trackSubjects.active, true))
      .orderBy(asc(trackGroups.code), asc(trackSubjects.code)),
    listSections(year.id),
    studentCountsBySection(year.id),
  ]);

  const groups: ScheduleGroup[] = [];
  for (const s of subjects) {
    if (!groups.some((g) => g.id === s.groupId))
      groups.push({ id: s.groupId, code: s.groupCode, name: s.groupName });
  }

  // Every รอบเรียน of the year, including those with no วันเรียน yet: the third
  // field of the add form offers them, and a รอบ waiting for its schedule is
  // exactly the one somebody comes here to give days to.
  const allSections: ScheduleSection[] = sections.map((s) => ({
    id: s.id,
    name: s.name,
    room: s.room,
    subjectId: s.subjectId,
    studentCount: counts.get(s.id) ?? 0,
  }));

  return (
    <ScheduleManager
      yearLabel={`ปีการศึกษา ${year.year}`}
      rows={rows}
      checkedKeys={checked}
      groups={groups}
      subjects={subjects as ScheduleSubject[]}
      sections={allSections}
    />
  );
}
