import { CalendarDays, RefreshCw, CheckCircle2 } from 'lucide-react';
import { allYears } from '@/lib/years';
import { Card, CardHeader, Badge, EmptyState } from '@/components/ui';
import { ActionButton } from '@/components/action-button';
import { thaiDateLong } from '@/lib/utils';
import { syncYearsAction } from './actions';

export const metadata = { title: 'ปีการศึกษา · Track' };

export default async function YearsPage() {
  const years = await allYears();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ปีการศึกษา</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ปฏิทินการศึกษาซิงก์จาก SchoolOS — ปีที่ใช้งานตามระบบกลาง แก้ไขที่นี่ไม่ได้
          </p>
        </div>
        <ActionButton action={syncYearsAction} icon={<RefreshCw className="size-4.5" strokeWidth={1.8} />}>
          ซิงก์จาก SchoolOS
        </ActionButton>
      </div>

      {years.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="size-8" strokeWidth={1.5} />}
          title="ยังไม่มีข้อมูลปีการศึกษา"
          hint="กดปุ่ม “ซิงก์จาก SchoolOS” เพื่อดึงปฏิทินการศึกษาเข้าระบบ"
        />
      ) : (
        <Card>
          <CardHeader icon={<CalendarDays className="size-4.5" strokeWidth={1.8} />} title="รายการปีการศึกษา" />
          <ul className="divide-y divide-border/60">
            {years.map((y) => (
              <li key={y.id} className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-sm font-bold text-primary tabular-nums">
                  {y.year}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">ปีการศึกษา {y.year}</p>
                  <p className="text-xs text-muted-foreground">
                    {y.startDate || y.endDate
                      ? `${thaiDateLong(y.startDate) || '—'} ถึง ${thaiDateLong(y.endDate) || '—'}`
                      : 'ไม่ระบุช่วงวันที่'}
                  </p>
                </div>
                {y.isActive ? (
                  <Badge tone="success" className="shrink-0">
                    <CheckCircle2 className="size-3.5" strokeWidth={2} />
                    ใช้งานอยู่
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
