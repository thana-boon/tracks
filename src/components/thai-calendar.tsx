'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  THAI_MONTHS,
  THAI_WEEKDAYS_SHORT,
  monthGrid,
  thaiDateLong,
  todayYmd,
  weekdayOfYmd,
} from '@/lib/utils';

/**
 * ปฏิทินไทย — a month grid in พ.ศ. with Thai month names, selecting any number
 * of calendar days. A วิชาเสริม usually runs on one day, sometimes three or
 * four, so selection is a toggle per day rather than a range: click to add,
 * click again to drop.
 *
 * Values in and out are plain "YYYY-MM-DD" (ค.ศ.) strings — only the display is
 * Buddhist-era, so nothing downstream has to know about the conversion.
 */
export function ThaiCalendar({
  selected,
  onToggle,
  className,
}: {
  selected: string[];
  onToggle: (date: string) => void;
  className?: string;
}) {
  const today = todayYmd();
  const [cursor, setCursor] = useState(() => {
    const start = [...selected].sort()[0] ?? today;
    const [y, m] = start.split('-').map(Number);
    return { year: y, month: m };
  });

  const cells = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const chosen = useMemo(() => new Set(selected), [selected]);

  function shift(by: number) {
    setCursor((c) => {
      const m = c.month + by;
      if (m < 1) return { year: c.year - 1, month: 12 };
      if (m > 12) return { year: c.year + 1, month: 1 };
      return { year: c.year, month: m };
    });
  }

  return (
    <div className={cn('rounded-xl border border-border bg-card p-3', className)}>
      <div className="mb-2 flex items-center justify-between">
        <NavButton label="เดือนก่อนหน้า" onClick={() => shift(-1)}>
          <ChevronLeft className="size-4.5" strokeWidth={2} />
        </NavButton>
        <p className="text-sm font-semibold">
          {THAI_MONTHS[cursor.month - 1]} {cursor.year + 543}
        </p>
        <NavButton label="เดือนถัดไป" onClick={() => shift(1)}>
          <ChevronRight className="size-4.5" strokeWidth={2} />
        </NavButton>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {THAI_WEEKDAYS_SHORT.map((w, i) => (
          <span
            key={w}
            className={cn(
              'py-1 text-[11px] font-medium',
              i === 0 || i === 6 ? 'text-muted-foreground/60' : 'text-muted-foreground',
            )}
          >
            {w}
          </span>
        ))}
        {cells.map((date, i) =>
          date === null ? (
            <span key={`b${i}`} />
          ) : (
            <button
              key={date}
              type="button"
              onClick={() => onToggle(date)}
              aria-pressed={chosen.has(date)}
              className={cn(
                'grid aspect-square place-items-center rounded-lg text-sm tabular-nums transition-colors',
                chosen.has(date)
                  ? 'bg-primary font-semibold text-primary-foreground'
                  : 'hover:bg-secondary/70',
                !chosen.has(date) && date === today && 'ring-1 ring-inset ring-primary/50 font-semibold text-primary',
                !chosen.has(date) &&
                  date !== today &&
                  (weekdayOfYmd(date) === 0 || weekdayOfYmd(date) === 6) &&
                  'text-muted-foreground',
              )}
            >
              {Number(date.slice(-2))}
            </button>
          ),
        )}
      </div>

      <button
        type="button"
        onClick={() => setCursor(() => {
          const [y, m] = today.split('-').map(Number);
          return { year: y, month: m };
        })}
        className="mt-2 w-full rounded-lg py-1 text-xs text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
      >
        กลับไปเดือนปัจจุบัน
      </button>
    </div>
  );
}

/** Selected dates as removable chips, ascending — the list under a calendar. */
export function SelectedDates({
  dates,
  onRemove,
  emptyHint = 'ยังไม่ได้เลือกวันเรียน',
}: {
  dates: string[];
  onRemove?: (date: string) => void;
  emptyHint?: string;
}) {
  const sorted = [...dates].sort();
  if (sorted.length === 0)
    return <p className="text-xs text-muted-foreground">{emptyHint}</p>;

  return (
    <ul className="flex flex-wrap gap-1.5">
      {sorted.map((d) => (
        <li key={d}>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-1 pl-2.5 pr-1.5 text-xs font-medium text-primary">
            {THAI_WEEKDAYS_SHORT[weekdayOfYmd(d)]} {thaiDateLong(d)}
            {onRemove ? (
              <button
                type="button"
                onClick={() => onRemove(d)}
                aria-label={`เอาวันที่ ${thaiDateLong(d)} ออก`}
                className="grid size-4 place-items-center rounded-full hover:bg-primary/20"
              >
                <X className="size-3" strokeWidth={2.5} />
              </button>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
    >
      {children}
    </button>
  );
}
