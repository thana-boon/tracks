import { Printer } from 'lucide-react';
import { activeYear } from '@/lib/years';
import { listSubjects } from '@/lib/data';
import { NeedYear, EmptyState } from '@/components/ui';
import { PrintPanel } from './print-panel';

export const metadata = { title: 'พิมพ์ใบเช็คชื่อ · Track' };

export default async function AttendancePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const year = await activeYear();
  if (!year) return <NeedYear />;

  const subjects = await listSubjects(true);
  if (subjects.length === 0)
    return (
      <EmptyState icon={<Printer className="size-8" strokeWidth={1.5} />} title="ยังไม่มีวิชาเสริม" hint="เพิ่มวิชาก่อน" />
    );

  const sp = await searchParams;
  const current = sp.subject ? Number(sp.subject) : subjects[0].id;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">พิมพ์ใบเช็คชื่อ</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          สร้างใบเช็คชื่อเปล่าสำหรับวิชา · ปีการศึกษา {year.year} — เปิดเป็น PDF แล้วสั่งพิมพ์
        </p>
      </div>
      <PrintPanel subjects={subjects} current={subjects.some((s) => s.id === current) ? current : subjects[0].id} />
    </div>
  );
}
