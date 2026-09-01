import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import {
  classroomStudents,
  classrooms,
  people,
  registrations,
  trackGroups,
  trackSubjects,
} from '@/db/schema';
import { activeYear } from '@/lib/years';
import { SEMESTERS, trackChoiceRows, tracksForTerm } from '@/lib/tracks';
import {
  listSections,
  classDatesBySection,
  studentCountsBySection,
  checkedDayCountsBySection,
} from '@/lib/data';
import { NeedYear } from '@/components/ui';
import {
  RegisterManager,
  type RegisterGroup,
  type RegisterSection,
  type RegisterSubject,
  type StudentGroup,
  type TrackSource,
} from './register-manager';
import type { PickStudent } from '@/components/student-picker';

export const metadata = { title: 'จัดนักเรียนเข้าวิชา' };

export default async function RegisterPage() {
  const year = await activeYear();
  if (!year) return <NeedYear />;

  const [subjects, sections, datesBy, counts, checkedBy, regs, students, rooms, roomMembers] =
    await Promise.all([
      db
        .select({
          id: trackSubjects.id,
          code: trackSubjects.code,
          name: trackSubjects.name,
          teacherName: trackSubjects.teacherName,
          groupId: trackSubjects.groupId,
          groupCode: trackGroups.code,
          groupName: trackGroups.name,
        })
        .from(trackSubjects)
        .innerJoin(trackGroups, eq(trackSubjects.groupId, trackGroups.id))
        .where(eq(trackSubjects.active, true))
        .orderBy(asc(trackGroups.code), asc(trackSubjects.code)),
      listSections(year.id),
      classDatesBySection(year.id),
      studentCountsBySection(year.id),
      checkedDayCountsBySection(year.id),
      db
        .select({ sectionId: registrations.sectionId, studentId: registrations.studentId })
        .from(registrations)
        .where(and(eq(registrations.yearId, year.id), isNull(registrations.droppedAt))),
      db
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
        .where(and(eq(people.type, 'student'), eq(people.status, 'studying')))
        .orderBy(asc(people.gradeLevel), asc(people.classroom), asc(people.classNumber)),
      db
        .select({ id: classrooms.id, name: classrooms.name, note: classrooms.note })
        .from(classrooms)
        .where(eq(classrooms.yearId, year.id))
        .orderBy(asc(classrooms.name)),
      db
        .select({
          classroomId: classroomStudents.classroomId,
          studentId: classroomStudents.studentId,
        })
        .from(classroomStudents)
        .innerJoin(classrooms, eq(classroomStudents.classroomId, classrooms.id))
        .where(eq(classrooms.yearId, year.id)),
    ]);

  const membersBy = new Map<number, number[]>();
  for (const r of regs) {
    const arr = membersBy.get(r.sectionId) ?? [];
    arr.push(r.studentId);
    membersBy.set(r.sectionId, arr);
  }
  const roomMembersBy = new Map<number, number[]>();
  for (const m of roomMembers) {
    const arr = roomMembersBy.get(m.classroomId) ?? [];
    arr.push(m.studentId);
    roomMembersBy.set(m.classroomId, arr);
  }

  const items: RegisterSection[] = sections.map((s) => ({
    ...s,
    classDates: datesBy.get(s.id) ?? [],
    memberIds: membersBy.get(s.id) ?? [],
    studentCount: counts.get(s.id) ?? 0,
    checkedDays: checkedBy.get(s.id) ?? 0,
  }));

  const groups: RegisterGroup[] = [];
  for (const s of subjects) {
    if (!groups.some((g) => g.id === s.groupId))
      groups.push({ id: s.groupId, code: s.groupCode, name: s.groupName });
  }

  const studentGroups: StudentGroup[] = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    note: r.note,
    memberIds: roomMembersBy.get(r.id) ?? [],
  }));

  // ── ดึงรายชื่อจาก Track ─────────────────────────────────────
  // A กลุ่มเรียน is very often exactly one สายการเรียน of the same ภาคเรียน, and
  // re-ticking forty names that the นักเรียน already chose for themselves is
  // both slow and a chance to get it wrong. Both ภาคเรียน of the active
  // ปีการศึกษา are offered because a รอบเรียน is scoped to the year, not the
  // term — the chip says which ภาคเรียน it came from, so nobody pulls last
  // term's list by accident.
  const trackSources: TrackSource[] = [];
  for (const semester of SEMESTERS) {
    const [defined, chosen] = await Promise.all([
      tracksForTerm(year.id, semester),
      trackChoiceRows(year.id, semester),
    ]);
    for (const t of defined) {
      const mine = chosen.filter((c) => c.trackId === t.id);
      if (!mine.length) continue;
      trackSources.push({
        key: `t${t.id}`,
        semester,
        trackName: t.name,
        optionName: null,
        memberIds: mine.map((c) => c.studentId),
      });
      // A สาย with แขนง is usually taught as one กลุ่ม per แขนง, so each is
      // offered on its own as well as inside the whole สาย.
      for (const o of t.options) {
        const ids = mine.filter((c) => c.optionId === o.id).map((c) => c.studentId);
        if (!ids.length) continue;
        trackSources.push({
          key: `t${t.id}o${o.id}`,
          semester,
          trackName: t.name,
          optionName: o.name,
          memberIds: ids,
        });
      }
    }
  }

  return (
    <RegisterManager
      yearLabel={`ปีการศึกษา ${year.year}`}
      groups={groups}
      subjects={subjects as RegisterSubject[]}
      sections={items}
      students={students as PickStudent[]}
      studentGroups={studentGroups}
      trackSources={trackSources}
    />
  );
}
