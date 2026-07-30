import { GraduationCap } from 'lucide-react';
import { activeYear } from '@/lib/years';
import { listSections, evaluateAll } from '@/lib/data';
import { NeedYear, Card, CardHeader, Badge, EmptyState, resultTone } from '@/components/ui';
import { SectionSwitcher } from '@/components/subject-switcher';
import { OVERALL_LABEL, PASS_MIN_RATIO } from '@/lib/evaluate';

export const metadata = { title: 'ผลการเรียน · Track' };

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const year = await activeYear();
  if (!year) return <NeedYear />;

  const sections = await listSections(year.id);
  if (sections.length === 0)
    return (
      <EmptyState icon={<GraduationCap className="size-8" strokeWidth={1.5} />} title="ยังไม่มีกลุ่มเรียน" hint="จัดนักเรียนเข้าวิชาก่อน" />
    );

  const sp = await searchParams;
  const current = sp.section ? Number(sp.section) : sections[0].id;
  const section = sections.find((s) => s.id === current) ?? sections[0];
  const rows = await evaluateAll(section.id);

  const summary = { excellent: 0, pass: 0, fail: 0, pending: 0 };
  for (const r of rows) summary[r.evaluation.overall] += 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ผลการเรียน</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            คำนวณอัตโนมัติจากการเช็คชื่อ · ปีการศึกษา {year.year} · เกณฑ์ผ่าน ≥ {Math.round(PASS_MIN_RATIO * 100)}%
          </p>
        </div>
        <SectionSwitcher sections={sections} current={section.id} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="ยอดเยี่ยม" value={summary.excellent} tone="accent" />
        <SummaryTile label="ผ่าน" value={summary.pass} tone="success" />
        <SummaryTile label="ไม่ผ่าน" value={summary.fail} tone="destructive" />
        <SummaryTile label="รอประเมิน" value={summary.pending} tone="secondary" />
      </div>

      {rows.length === 0 ? (
        <EmptyState title="ยังไม่มีนักเรียนในกลุ่มนี้" hint="จัดนักเรียนเข้ากลุ่มนี้ก่อน" />
      ) : (
        <Card>
          <CardHeader
            icon={<GraduationCap className="size-4.5" strokeWidth={1.8} />}
            title={`${section.subjectCode} — ${section.subjectName} · ${section.name}`}
            action={<Badge tone="navy">{rows.length} คน</Badge>}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">นักเรียน</th>
                  <th className="px-3 py-2.5 text-center font-medium">ชั้น/ห้อง</th>
                  <th className="px-3 py-2.5 text-center font-medium">มาตรง</th>
                  <th className="px-3 py-2.5 text-center font-medium">ครึ่งวัน</th>
                  <th className="px-3 py-2.5 text-center font-medium">ขาด</th>
                  <th className="px-3 py-2.5 text-center font-medium">เข้าเรียน</th>
                  <th className="px-3 py-2.5 text-center font-medium">ผล</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map(({ student, evaluation }) => (
                  <tr key={student.id} className="hover:bg-secondary/40">
                    <td className="px-4 py-2">
                      <p className="truncate font-medium">{student.fullName}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">{student.code}</p>
                    </td>
                    <td className="px-3 py-2 text-center text-xs text-muted-foreground">
                      {student.gradeLevel}/{student.classroom}
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums text-success">{evaluation.counts.excellent}</td>
                    <td className="px-3 py-2 text-center tabular-nums text-[#8a6a00]">{evaluation.counts.partial}</td>
                    <td className="px-3 py-2 text-center tabular-nums text-destructive">{evaluation.counts.absent}</td>
                    <td className="px-3 py-2 text-center tabular-nums">
                      {evaluation.totalDays === 0 ? '—' : `${Math.round(evaluation.attendedRatio * 100)}%`}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Badge tone={resultTone(evaluation.overall)}>{OVERALL_LABEL[evaluation.overall]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'accent' | 'success' | 'destructive' | 'secondary';
}) {
  const ring: Record<string, string> = {
    accent: 'text-[#8a6a00]',
    success: 'text-success',
    destructive: 'text-destructive',
    secondary: 'text-muted-foreground',
  };
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${ring[tone]}`}>{value.toLocaleString('th-TH')}</p>
    </Card>
  );
}
