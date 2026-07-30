import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { classrooms, people, trackGroups, trackSubjects } from '@/db/schema';
import { activeYear } from '@/lib/years';
import { sortGrades } from '@/lib/utils';
import { NeedYear } from '@/components/ui';
import { TranscriptPanel } from './transcript-panel';

export const metadata = { title: 'ทรานสคริปต์ · Track' };

export default async function TranscriptPage() {
  const year = await activeYear();
  if (!year) return <NeedYear />;

  const [gradeRooms, subjects, rooms] = await Promise.all([
    db
      .select({ gradeLevel: people.gradeLevel, classroom: people.classroom })
      .from(people)
      .where(and(eq(people.type, 'student'), eq(people.status, 'studying'))),
    db
      .select({ id: trackSubjects.id, code: trackSubjects.code, name: trackSubjects.name, groupCode: trackGroups.code })
      .from(trackSubjects)
      .innerJoin(trackGroups, eq(trackSubjects.groupId, trackGroups.id))
      .where(eq(trackSubjects.active, true))
      .orderBy(asc(trackGroups.code), asc(trackSubjects.code)),
    db
      .select({ id: classrooms.id, name: classrooms.name })
      .from(classrooms)
      .where(eq(classrooms.yearId, year.id))
      .orderBy(asc(classrooms.name)),
  ]);

  const grades = sortGrades(gradeRooms.map((g) => g.gradeLevel));
  const roomsByGrade: Record<string, string[]> = {};
  for (const g of gradeRooms) {
    if (!g.gradeLevel || !g.classroom) continue;
    (roomsByGrade[g.gradeLevel] ??= []);
    if (!roomsByGrade[g.gradeLevel].includes(g.classroom)) roomsByGrade[g.gradeLevel].push(g.classroom);
  }
  for (const k of Object.keys(roomsByGrade))
    roomsByGrade[k].sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ทรานสคริปต์วิชาเสริม</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ออกใบแสดงผลวิชาเสริม 1 หน้าต่อ 1 นักเรียน · ปีการศึกษา {year.year} — เปิดเป็น PDF แล้วสั่งพิมพ์
        </p>
      </div>
      <TranscriptPanel
        grades={grades}
        roomsByGrade={roomsByGrade}
        subjects={subjects}
        classrooms={rooms}
      />
    </div>
  );
}
