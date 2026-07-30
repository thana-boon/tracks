import { BookOpen, CalendarClock, MapPin } from 'lucide-react';
import { requireRole } from '@/lib/authz';
import { activeYear } from '@/lib/years';
import { buildTranscripts } from '@/lib/transcript';
import { classDatesOf } from '@/lib/data';
import { db } from '@/db';
import { registrations, subjectSections, trackSubjects } from '@/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { Card, CardHeader, Badge, EmptyState, NeedYear, resultTone } from '@/components/ui';
import { OVERALL_LABEL, PASS_MIN_RATIO } from '@/lib/evaluate';
import { thaiDateShort } from '@/lib/utils';

export const metadata = { title: 'วิชาเสริมของฉัน · Track' };

export default async function StudentHome() {
  const user = await requireRole('student');
  const year = await activeYear();
  if (!year) return <NeedYear />;
  if (!user.personId) return <EmptyState title="ไม่พบข้อมูลนักเรียน" hint="ติดต่อผู้ดูแล" />;

  const [transcript] = await buildTranscripts(year, [user.personId]);
  const lines = transcript?.lines ?? [];

  // Class days per section the student sits in, keyed the same way its
  // transcript line is — two รอบ of one วิชา have different days.
  const regRows = await db
    .select({ sectionId: registrations.sectionId, sectionName: subjectSections.name, code: trackSubjects.code })
    .from(registrations)
    .innerJoin(subjectSections, eq(registrations.sectionId, subjectSections.id))
    .innerJoin(trackSubjects, eq(registrations.subjectId, trackSubjects.id))
    .where(and(eq(registrations.studentId, user.personId), eq(registrations.yearId, year.id), isNull(registrations.droppedAt)));
  const datesByLine = new Map<string, string[]>();
  await Promise.all(
    regRows.map(async (r) => {
      datesByLine.set(`${r.code}|${r.sectionName}`, await classDatesOf(r.sectionId));
    }),
  );

  return (
    <div className="space-y-6">
      <section className="anim-fade-up overflow-hidden rounded-2xl bg-[#2a1547] p-6 text-white lg:p-7">
        <p className="text-xs font-medium uppercase tracking-wide text-white/60">วิชาเสริม ปีการศึกษา {year.year}</p>
        <h1 className="mt-1 text-2xl font-semibold">{user.name}</h1>
        <p className="mt-1 text-sm text-white/70">
          {transcript?.student.gradeLevel}/{transcript?.student.classroom} · ลงวิชาเสริม {lines.length} วิชา
        </p>
        <div className="mt-4 h-0.5 w-10 rounded-full bg-[#F5C518]" />
      </section>

      {lines.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-8" strokeWidth={1.5} />}
          title="ยังไม่ได้ลงทะเบียนวิชาเสริม"
          hint="ผู้ดูแลจะเป็นผู้จัดนักเรียนเข้าวิชา — หากมีข้อสงสัยติดต่อครูที่ปรึกษา"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {lines.map((l, i) => {
            const days = (datesByLine.get(`${l.subjectCode}|${l.sectionName}`) ?? [])
              .map((d) => thaiDateShort(d))
              .join(', ');
            return (
              <Card key={i} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Badge tone="primary" className="mb-2">{l.groupCode} · {l.subjectCode}</Badge>
                    <h2 className="font-semibold leading-snug">{l.subjectName}</h2>
                    {l.teacherName ? <p className="mt-0.5 text-xs text-muted-foreground">ครู {l.teacherName}</p> : null}
                  </div>
                  <Badge tone={resultTone(l.overall)}>{OVERALL_LABEL[l.overall]}</Badge>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {days ? (
                    <span className="flex items-center gap-1"><CalendarClock className="size-3.5" strokeWidth={1.8} /> {days}</span>
                  ) : null}
                  {l.room ? (
                    <span className="flex items-center gap-1"><MapPin className="size-3.5" strokeWidth={1.8} /> {l.room}</span>
                  ) : null}
                  <span>เข้าเรียน {l.totalDays === 0 ? '—' : `${Math.round(l.attendedRatio * 100)}%`}</span>
                  <span>· เกณฑ์ผ่าน ≥ {Math.round(PASS_MIN_RATIO * 100)}%</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
