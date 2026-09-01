import Link from 'next/link';
import { BookOpen, CalendarClock, ChevronRight, MapPin, Route } from 'lucide-react';
import { requireRole } from '@/lib/authz';
import { activeYear } from '@/lib/years';
import { buildYearResults } from '@/lib/transcript';
import { classDatesOf } from '@/lib/data';
import { db } from '@/db';
import { registrations, subjectSections, trackSubjects } from '@/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { Card, CardHeader, Badge, EmptyState, NeedYear, resultTone } from '@/components/ui';
import { OVERALL_LABEL, PASS_MIN_RATIO } from '@/lib/evaluate';
import { thaiDateShort } from '@/lib/utils';
import { choiceOf, latestTerm, termLabel } from '@/lib/tracks';

export const metadata = { title: 'วิชาเสริมของฉัน' };

export default async function StudentHome() {
  const user = await requireRole('student');
  const year = await activeYear();
  if (!year) return <NeedYear />;
  if (!user.personId) return <EmptyState title="ไม่พบข้อมูลนักเรียน" hint="ติดต่อผู้ดูแล" />;

  const [results] = await buildYearResults(year, [user.personId]);
  const lines = results?.lines ?? [];

  // Track (สายการเรียน) for the ภาคเรียน currently open — either what they
  // picked, or the invitation to pick. It sits on this page because this is the
  // page a นักเรียน lands on, and a choice they have not made yet is the one
  // thing here that needs them to do something.
  const openTerm = await latestTerm();
  const trackChoice = openTerm ? await choiceOf(user.personId, openTerm.yearId, openTerm.semester) : null;

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
          {results?.student.gradeLevel}/{results?.student.classroom} · ลงวิชาเสริม {lines.length} วิชา
        </p>
        <div className="mt-4 h-0.5 w-10 rounded-full bg-[#F5C518]" />
      </section>

      {openTerm ? (
        <Link
          href="/student/track"
          className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-xs transition-colors hover:bg-secondary/40"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Route className="size-5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{termLabel(openTerm)}</p>
            {trackChoice ? (
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <p className="font-semibold">{trackChoice.trackName}</p>
                {trackChoice.optionName ? (
                  <Badge tone="navy">{trackChoice.optionName}</Badge>
                ) : null}
              </div>
            ) : (
              <>
                <p className="mt-0.5 font-semibold">ยังไม่ได้เลือก Track</p>
                <p className="text-xs text-muted-foreground">
                  กดเพื่อเลือกสายการเรียน — เลือกได้ครั้งเดียวต่อภาคเรียน
                </p>
              </>
            )}
          </div>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
        </Link>
      ) : null}

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
