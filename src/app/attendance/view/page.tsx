import Link from 'next/link';
import { Eye, Printer } from 'lucide-react';
import { activeYear } from '@/lib/years';
import { listSubjects, evaluateAll } from '@/lib/data';
import { NeedYear, Card, CardHeader, Badge, EmptyState, Button, resultTone } from '@/components/ui';
import { SubjectSwitcher } from '@/components/subject-switcher';
import { DAY_RESULT_LABEL, OVERALL_LABEL } from '@/lib/evaluate';
import { thaiDateShort, THAI_WEEKDAYS_SHORT, weekdayOfYmd } from '@/lib/utils';

export const metadata = { title: 'ผลเช็คชื่อ · Track' };

export default async function AttendanceViewPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const year = await activeYear();
  if (!year) return <NeedYear />;

  const subjects = await listSubjects(true);
  if (subjects.length === 0)
    return (
      <EmptyState icon={<Eye className="size-8" strokeWidth={1.5} />} title="ยังไม่มีวิชาเสริม" hint="เพิ่มวิชาและจัดนักเรียนก่อน" />
    );

  const sp = await searchParams;
  const current = sp.subject ? Number(sp.subject) : subjects[0].id;
  const subject = subjects.find((s) => s.id === current) ?? subjects[0];
  const rows = await evaluateAll(subject.id, year.id);
  const dates = rows[0]?.evaluation.days.map((d) => d.date) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ผลเช็คชื่อ</h1>
          <p className="mt-1 text-sm text-muted-foreground">สรุปการเข้าเรียนรายวิชา · ปีการศึกษา {year.year}</p>
        </div>
        <div className="flex items-center gap-2">
          <SubjectSwitcher subjects={subjects} current={subject.id} />
          <Link href={`/attendance/print?subject=${subject.id}`}>
            <Button variant="secondary" size="md">
              <Printer className="size-4.5" strokeWidth={1.8} /> พิมพ์
            </Button>
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="ยังไม่มีนักเรียนในวิชานี้" hint="จัดนักเรียนเข้าวิชาก่อนที่หน้า “จัดนักเรียนเข้าวิชา”" />
      ) : (
        <Card>
          <CardHeader
            icon={<Eye className="size-4.5" strokeWidth={1.8} />}
            title={`${subject.code} — ${subject.name}`}
            action={<Badge tone="navy">{rows.length} คน · {dates.length} วันที่เรียน</Badge>}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="sticky left-0 z-10 bg-card px-4 py-2.5 text-left font-medium">นักเรียน</th>
                  {dates.map((d) => (
                    <th key={d} className="px-1.5 py-2.5 text-center font-medium">
                      <div>{thaiDateShort(d)}</div>
                      <div className="text-[10px] text-muted-foreground/70">
                        {THAI_WEEKDAYS_SHORT[weekdayOfYmd(d)]}
                      </div>
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-center font-medium">สรุป</th>
                  <th className="px-3 py-2.5 text-center font-medium">ผล</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map(({ student, evaluation }) => (
                  <tr key={student.id} className="hover:bg-secondary/40">
                    <td className="sticky left-0 z-10 bg-card px-4 py-2 hover:bg-secondary/40">
                      <p className="truncate font-medium">{student.fullName}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">{student.code}</p>
                    </td>
                    {evaluation.days.map((day) => (
                      <td key={day.date} className="px-1.5 py-2 text-center" title={DAY_RESULT_LABEL[day.result]}>
                        <div className="flex justify-center gap-0.5">
                          <SlotDot value={day.morning} />
                          <SlotDot value={day.afternoon} />
                        </div>
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center text-xs text-muted-foreground tabular-nums">
                      {evaluation.counts.excellent}/{evaluation.counts.partial}/{evaluation.counts.absent}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Badge tone={resultTone(evaluation.overall)}>{OVERALL_LABEL[evaluation.overall]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-4 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><SlotDot value={true} /> มา</span>
            <span className="flex items-center gap-1.5"><SlotDot value={false} /> ขาด</span>
            <span className="flex items-center gap-1.5"><SlotDot value={null} /> ไม่มีคาบ</span>
            <span>· สรุป = ยอดเยี่ยม/ครึ่งวัน/ขาด</span>
          </div>
        </Card>
      )}
    </div>
  );
}

function SlotDot({ value }: { value: boolean | null }) {
  const cls =
    value === true ? 'bg-success' : value === false ? 'bg-destructive' : 'bg-border';
  return <span className={`inline-block size-2.5 rounded-full ${cls}`} />;
}
