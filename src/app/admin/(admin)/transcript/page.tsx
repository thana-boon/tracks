import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { people } from '@/db/schema';
import { activeYear } from '@/lib/years';
import { sortGrades } from '@/lib/utils';
import { NeedYear } from '@/components/ui';
import { TranscriptPanel } from './transcript-panel';

export const metadata = { title: 'ทรานสคริปต์' };

export default async function TranscriptPage() {
  const year = await activeYear();
  if (!year) return <NeedYear />;

  // One query serves both ways of choosing: the ชั้น/ห้อง dropdowns are derived
  // from the same roster the รายบุคคล picker filters through.
  const students = await db
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
    .orderBy(
      asc(people.gradeLevel),
      asc(people.classroom),
      asc(people.classNumber),
      asc(people.code),
    );

  const grades = sortGrades(students.map((s) => s.gradeLevel));
  const roomsByGrade: Record<string, string[]> = {};
  for (const s of students) {
    if (!s.gradeLevel || !s.classroom) continue;
    (roomsByGrade[s.gradeLevel] ??= []);
    if (!roomsByGrade[s.gradeLevel].includes(s.classroom))
      roomsByGrade[s.gradeLevel].push(s.classroom);
  }
  for (const k of Object.keys(roomsByGrade))
    roomsByGrade[k].sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ทรานสคริปต์วิชาเสริม</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ออกใบแสดงผลวิชาเสริม 1 หน้า A4 ต่อ 1 นักเรียน — รวมวิชาที่ผ่านของ<strong>ทุกปีการศึกษา</strong>ที่นักเรียนสะสมไว้
          ไม่ใช่เฉพาะปี {year.year}
        </p>
      </div>
      <TranscriptPanel grades={grades} roomsByGrade={roomsByGrade} students={students} />
    </div>
  );
}
