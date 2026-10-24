import { and, asc, count, eq } from 'drizzle-orm';
import { db } from '@/db';
import { classroomStudents, classrooms, people, trackGroups, trackSubjects } from '@/db/schema';
import { activeYear } from '@/lib/years';
import { syncTrackRosters } from '@/lib/track-roster';
import { requireCatalogEditor } from '@/lib/authz';
import { checkedDayKeys, scheduleBlocksOf, yearSchedule } from '@/lib/schedule';
import { listHomerooms } from '@/lib/homeroom';
import { gradeKey, isTrackGrade } from '@/lib/utils';
import { listSections, studentCountsBySection } from '@/lib/data';
import { SEMESTERS, trackChoiceRows, tracksForTerm } from '@/lib/tracks';
import { NeedYear } from '@/components/ui';
import {
  ScheduleManager,
  type ScheduleGroup,
  type ScheduleHomeroom,
  type ScheduleSection,
  type ScheduleSubject,
  type ScheduleTrackGroup,
  type ScheduleSavedGroup,
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
  const user = await requireCatalogEditor();
  const year = await activeYear();
  if (!year) return <NeedYear />;
  // นักเรียน who chose a Track are in its กลุ่ม before the headcounts are read.
  await syncTrackRosters(year.id);

  const [rows, checked, subjects, sections, counts, blocks, homerooms, groups] = await Promise.all([
    yearSchedule(year.id),
    checkedDayKeys(year.id),
    db
      .select({
        id: trackSubjects.id,
        code: trackSubjects.code,
        name: trackSubjects.name,
        teacherName: trackSubjects.teacherName,
        institution: trackSubjects.institution,
        semester: trackSubjects.semester,
        phase: trackSubjects.phase,
        groupId: trackSubjects.groupId,
        groupCode: trackGroups.code,
        groupName: trackGroups.name,
        groupColor: trackGroups.color,
      })
      .from(trackSubjects)
      .innerJoin(trackGroups, eq(trackSubjects.groupId, trackGroups.id))
      .where(eq(trackSubjects.active, true))
      .orderBy(asc(trackGroups.code), asc(trackSubjects.code)),
    listSections(year.id),
    studentCountsBySection(year.id),
    scheduleBlocksOf(year.id),
    listHomerooms(year),
    // Every open กลุ่มวิชา — not only those with a วิชา yet — since a ครู may
    // create the first วิชา of a กลุ่ม right from a cell of the timetable.
    db
      .select({
        id: trackGroups.id,
        code: trackGroups.code,
        name: trackGroups.name,
        color: trackGroups.color,
      })
      .from(trackGroups)
      .where(eq(trackGroups.active, true))
      .orderBy(asc(trackGroups.code)) as Promise<ScheduleGroup[]>,
  ]);

  // ห้องประจำชั้น ม.4-6, offered on ตารางรอบ as ready-made ห้อง that bring
  // their own นักเรียน.
  const homeroomsOffered: ScheduleHomeroom[] = homerooms
    .filter((h) => isTrackGrade(h.gradeLevel))
    .sort(
      (a, b) =>
        gradeKey(a.gradeLevel) - gradeKey(b.gradeLevel) ||
        a.classroom.localeCompare(b.classroom, 'th', { numeric: true }),
    )
    .map((h) => ({
      gradeLevel: h.gradeLevel,
      classroom: h.classroom,
      studentCount: h.studentCount,
    }));

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

  // กลุ่มจาก Track — the นักเรียน who chose a สาย (or one แขนง of it) for
  // themselves, offered in the third field as a กลุ่ม ready to open. Built the
  // same way จัดนักเรียนเข้าวิชา builds its "ดึงรายชื่อจาก Track" chips; a
  // moderator places no นักเรียน, so gets none.
  const trackGroupsOffered: ScheduleTrackGroup[] = [];
  let savedGroups: ScheduleSavedGroup[] = [];
  if (user.role === 'admin') {
    // กลุ่มเรียนพิเศษ saved on จัดนักเรียนเข้าวิชา — counted as the action will
    // place them: นักเรียน still studying only.
    savedGroups = await db
      .select({ id: classrooms.id, name: classrooms.name, studentCount: count(people.id) })
      .from(classrooms)
      .leftJoin(classroomStudents, eq(classroomStudents.classroomId, classrooms.id))
      .leftJoin(
        people,
        and(eq(classroomStudents.studentId, people.id), eq(people.status, 'studying')),
      )
      .where(eq(classrooms.yearId, year.id))
      .groupBy(classrooms.id, classrooms.name)
      .orderBy(asc(classrooms.name));

    for (const semester of SEMESTERS) {
      const [defined, chosen] = await Promise.all([
        tracksForTerm(year.id, semester),
        trackChoiceRows(year.id, semester),
      ]);
      for (const t of defined) {
        const mine = chosen.filter((c) => c.trackId === t.id);
        if (!mine.length) continue;
        trackGroupsOffered.push({
          key: `${semester}:${t.id}`,
          semester,
          trackId: t.id,
          optionId: null,
          label: t.name,
          groupIds: [t.groupId, ...t.options.map((o) => o.groupId)].filter(
            (g): g is number => g != null,
          ),
          studentCount: mine.length,
        });
        for (const o of t.options) {
          const n = mine.filter((c) => c.optionId === o.id).length;
          if (!n) continue;
          trackGroupsOffered.push({
            key: `${semester}:${t.id}:${o.id}`,
            semester,
            trackId: t.id,
            optionId: o.id,
            label: `${t.name} · ${o.name}`,
            groupIds: [o.groupId ?? t.groupId].filter((g): g is number => g != null),
            studentCount: n,
          });
        }
      }
    }
  }

  return (
    <ScheduleManager
      yearLabel={`ปีการศึกษา ${year.year}`}
      rows={rows}
      blocks={blocks}
      homerooms={homeroomsOffered}
      checkedKeys={checked}
      groups={groups}
      subjects={subjects as ScheduleSubject[]}
      sections={allSections}
      trackGroups={trackGroupsOffered}
      savedGroups={savedGroups}
      // จัดนักเรียนเข้าวิชา is a ผู้ดูแล screen; a moderator gets no link to it.
      canRegister={user.role === 'admin'}
    />
  );
}
