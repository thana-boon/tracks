import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import {
  people,
  registrations,
  subjectDays,
  trackGroups,
  trackSubjects,
} from '@/db/schema';
import { activeYear } from '@/lib/years';
import { NeedYear } from '@/components/ui';
import { RegisterManager, type RegisterSubject } from './register-manager';
import type { PickStudent } from '@/components/student-picker';

export const metadata = { title: 'จัดนักเรียนเข้าวิชา · Track' };

export default async function RegisterPage() {
  const year = await activeYear();
  if (!year) return <NeedYear />;

  const [subjects, days, regs, students] = await Promise.all([
    db
      .select({
        id: trackSubjects.id,
        code: trackSubjects.code,
        name: trackSubjects.name,
        teacherName: trackSubjects.teacherName,
        groupCode: trackGroups.code,
        groupName: trackGroups.name,
      })
      .from(trackSubjects)
      .innerJoin(trackGroups, eq(trackSubjects.groupId, trackGroups.id))
      .where(eq(trackSubjects.active, true))
      .orderBy(asc(trackGroups.code), asc(trackSubjects.code)),
    db
      .select({ subjectId: subjectDays.subjectId, dayOfWeek: subjectDays.dayOfWeek })
      .from(subjectDays)
      .where(eq(subjectDays.yearId, year.id)),
    db
      .select({ subjectId: registrations.subjectId, studentId: registrations.studentId })
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
  ]);

  const daysBy = new Map<number, number[]>();
  for (const d of days) {
    const arr = daysBy.get(d.subjectId) ?? [];
    arr.push(d.dayOfWeek);
    daysBy.set(d.subjectId, arr);
  }
  const membersBy = new Map<number, number[]>();
  for (const r of regs) {
    const arr = membersBy.get(r.subjectId) ?? [];
    arr.push(r.studentId);
    membersBy.set(r.subjectId, arr);
  }

  const items: RegisterSubject[] = subjects.map((s) => ({
    ...s,
    meetingDays: (daysBy.get(s.id) ?? []).sort(),
    memberIds: membersBy.get(s.id) ?? [],
  }));

  return (
    <RegisterManager
      yearLabel={`ปีการศึกษา ${year.year}`}
      subjects={items}
      students={students as PickStudent[]}
    />
  );
}
