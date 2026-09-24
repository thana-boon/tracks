import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { classrooms, classroomStudents, people } from '@/db/schema';
import { activeYear } from '@/lib/years';
import { NeedYear } from '@/components/ui';
import { ClassroomsManager, type ClassroomItem } from './classrooms-manager';
import type { PickStudent } from '@/components/student-picker';

export const metadata = { title: 'ห้องเรียนพิเศษ' };

export default async function ClassroomsPage() {
  const year = await activeYear();
  if (!year) return <NeedYear />;

  const [rooms, members, students] = await Promise.all([
    db
      .select()
      .from(classrooms)
      .where(eq(classrooms.yearId, year.id))
      .orderBy(asc(classrooms.name)),
    db
      .select({ classroomId: classroomStudents.classroomId, studentId: classroomStudents.studentId })
      .from(classroomStudents)
      .innerJoin(classrooms, eq(classroomStudents.classroomId, classrooms.id))
      .where(eq(classrooms.yearId, year.id)),
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

  const byRoom = new Map<number, number[]>();
  for (const m of members) {
    const arr = byRoom.get(m.classroomId) ?? [];
    arr.push(m.studentId);
    byRoom.set(m.classroomId, arr);
  }

  const items: ClassroomItem[] = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    note: r.note,
    memberIds: byRoom.get(r.id) ?? [],
  }));

  return (
    <ClassroomsManager
      yearLabel={`ปีการศึกษา ${year.year}`}
      classrooms={items}
      students={students as PickStudent[]}
    />
  );
}
