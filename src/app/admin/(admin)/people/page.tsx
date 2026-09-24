import { eq, sql } from 'drizzle-orm';
import { GraduationCap, Users, School, RefreshCw, RefreshCcwDot } from 'lucide-react';
import { db } from '@/db';
import { people, homerooms } from '@/db/schema';
import { activeYear } from '@/lib/years';
import { readSyncState } from '@/lib/auto-sync';
import { Card, CardHeader, EmptyState } from '@/components/ui';
import { ActionButton } from '@/components/action-button';
import { SyncStatus } from '@/components/sync-status';
import { sortGrades } from '@/lib/utils';
import {
  syncStudentsAction,
  syncTeachersAction,
  syncHomeroomsAction,
  syncAllAction,
} from './actions';

export const metadata = { title: 'ซิงก์รายชื่อ' };

/** The roster is refreshed by the scheduler; nothing here has to be pressed. */
export default async function PeoplePage() {
  const year = await activeYear();

  const [studentByGrade, teacherCount, homeroomCount, syncState] = await Promise.all([
    db
      .select({ grade: people.gradeLevel, n: sql<number>`count(*)` })
      .from(people)
      .where(eq(people.type, 'student'))
      .groupBy(people.gradeLevel),
    db
      .select({ n: sql<number>`count(*)` })
      .from(people)
      .where(eq(people.type, 'teacher')),
    year
      ? db
          .select({ n: sql<number>`count(*)` })
          .from(homerooms)
          .where(eq(homerooms.yearId, year.id))
      : Promise.resolve([{ n: 0 }]),
    readSyncState(),
  ]);

  const totalStudents = studentByGrade.reduce((a, g) => a + Number(g.n), 0);
  const gradeMap = new Map(studentByGrade.map((g) => [g.grade ?? '—', Number(g.n)]));
  const grades = sortGrades(studentByGrade.map((g) => g.grade));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ซิงก์รายชื่อ</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ระบบดึงนักเรียน ม.4-6 · ครู · ครูที่ปรึกษา จาก SchoolOS ให้อัตโนมัติ —
            ปุ่มด้านล่างมีไว้เผื่ออยากอัปเดตทันที ไม่ต้องรอรอบถัดไป
          </p>
        </div>
        <ActionButton
          action={syncAllAction}
          icon={<RefreshCcwDot className="size-4.5" strokeWidth={1.8} />}
        >
          ซิงก์ทั้งหมดเดี๋ยวนี้
        </ActionButton>
      </div>

      <SyncStatus state={syncState} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader
            icon={<GraduationCap className="size-4.5" strokeWidth={1.8} />}
            title="นักเรียน ม.4-6"
          />
          <div className="px-4 pb-4 sm:px-5">
            <p className="text-3xl font-semibold tabular-nums">{totalStudents.toLocaleString('th-TH')}</p>
            <p className="text-xs text-muted-foreground">คนในระบบ</p>
            {grades.length ? (
              <ul className="mt-3 space-y-1.5">
                {grades.map((g) => (
                  <li key={g} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{g}</span>
                    <span className="font-medium tabular-nums">{gradeMap.get(g)?.toLocaleString('th-TH')}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-4">
              <ActionButton
                action={syncStudentsAction}
                size="sm"
                variant="secondary"
                className="w-full"
                icon={<RefreshCw className="size-4" strokeWidth={1.8} />}
              >
                ซิงก์นักเรียน
              </ActionButton>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader icon={<Users className="size-4.5" strokeWidth={1.8} />} title="ครู" />
          <div className="px-4 pb-4 sm:px-5">
            <p className="text-3xl font-semibold tabular-nums">
              {Number(teacherCount[0]?.n ?? 0).toLocaleString('th-TH')}
            </p>
            <p className="text-xs text-muted-foreground">คนในระบบ</p>
            <p className="mt-3 text-xs text-muted-foreground">
              ครูทุกคนที่ยัง active — ใช้สำหรับเช็คชื่อและกำหนดผู้สอน
            </p>
            <div className="mt-4">
              <ActionButton
                action={syncTeachersAction}
                size="sm"
                variant="secondary"
                className="w-full"
                icon={<RefreshCw className="size-4" strokeWidth={1.8} />}
              >
                ซิงก์ครู
              </ActionButton>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader icon={<School className="size-4.5" strokeWidth={1.8} />} title="ครูที่ปรึกษา" />
          <div className="px-4 pb-4 sm:px-5">
            <p className="text-3xl font-semibold tabular-nums">
              {Number(homeroomCount[0]?.n ?? 0).toLocaleString('th-TH')}
            </p>
            <p className="text-xs text-muted-foreground">
              รายการห้อง–ครู {year ? `ปี ${year.year}` : ''}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              ใช้ตรวจสิทธิ์ครูที่ปรึกษาให้ดูห้องตัวเองได้ (ระบบซิงก์ครูให้ก่อนเสมอ)
            </p>
            <div className="mt-4">
              <ActionButton
                action={syncHomeroomsAction}
                size="sm"
                variant="secondary"
                className="w-full"
                icon={<RefreshCw className="size-4" strokeWidth={1.8} />}
              >
                ซิงก์ครูที่ปรึกษา
              </ActionButton>
            </div>
          </div>
        </Card>
      </div>

      {!year ? (
        <EmptyState
          title="ยังไม่มีปีการศึกษาที่ใช้งาน"
          hint="ครูที่ปรึกษาผูกกับปีการศึกษา — รอบซิงก์อัตโนมัติจะดึงปีให้เอง หรือกด “ซิงก์ทั้งหมดเดี๋ยวนี้” ด้านบน"
        />
      ) : null}
    </div>
  );
}
