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
} from './register-manager';
import type { PickStudent } from '@/components/student-picker';

export const metadata = { title: 'จัดนักเรียนเข้าวิชา · Track' };

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

  return (
    <RegisterManager
      yearLabel={`ปีการศึกษา ${year.year}`}
      groups={groups}
      subjects={subjects as RegisterSubject[]}
      sections={items}
      students={students as PickStudent[]}
      studentGroups={studentGroups}
    />
  );
}
