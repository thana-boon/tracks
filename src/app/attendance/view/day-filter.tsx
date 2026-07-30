'use client';

import { useRouter } from 'next/navigation';
import { CalendarSearch } from 'lucide-react';
import { Select } from '@/components/ui';
import { thaiMonthLabel } from '@/lib/utils';

export type DayStatus = 'all' | 'pending' | 'done';

/**
 * Narrowing for the day list, which only grows as the year runs. Month and
 * status filter what is listed; the date box jumps straight to one day, so a
 * known date never has to be hunted for at all.
 */
export function DayFilter({
  months,
  month,
  status,
  count,
}: {
  /** "YYYY-MM" of every month that has class days, ascending */
  months: string[];
  month: string;
  status: DayStatus;
  /** how many days the current filter leaves */
  count: number;
}) {
  const router = useRouter();

  function go(next: { month?: string; status?: DayStatus }) {
    const sp = new URLSearchParams();
    sp.set('month', next.month ?? month);
    sp.set('status', next.status ?? status);
    router.push(`/attendance/view?${sp.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="min-w-40 flex-1">
        <label htmlFor="f-month" className="mb-1 block text-xs font-medium text-muted-foreground">
          เดือน
        </label>
        <Select
          id="f-month"
          className="h-10"
          value={month}
          onChange={(e) => go({ month: e.target.value })}
        >
          <option value="all">ทุกเดือน</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {thaiMonthLabel(m)}
            </option>
          ))}
        </Select>
      </div>

      <div className="min-w-40 flex-1">
        <label htmlFor="f-status" className="mb-1 block text-xs font-medium text-muted-foreground">
          สถานะ
        </label>
        <Select
          id="f-status"
          className="h-10"
          value={status}
          onChange={(e) => go({ status: e.target.value as DayStatus })}
        >
          <option value="all">ทั้งหมด</option>
          <option value="pending">ยังเช็คไม่ครบ</option>
          <option value="done">เช็คครบแล้ว</option>
        </Select>
      </div>

      <div className="min-w-44 flex-1">
        <label htmlFor="f-jump" className="mb-1 block text-xs font-medium text-muted-foreground">
          ไปที่วันที่
        </label>
        <input
          id="f-jump"
          type="date"
          className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-primary"
          onChange={(e) => {
            if (e.target.value) router.push(`/attendance/view?date=${e.target.value}`);
          }}
        />
      </div>

      <p className="flex h-10 items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarSearch className="size-4" strokeWidth={1.8} />
        {count} วัน
      </p>
    </div>
  );
}
