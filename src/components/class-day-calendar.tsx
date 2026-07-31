'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  THAI_MONTHS,
  THAI_WEEKDAYS_SHORT,
  cn,
  monthGrid,
  thaiDateLong,
  thaiDateShort,
  weekdayOfYmd,
} from '@/lib/utils';

/** The minimum a day has to carry to be picked — `ClassDay` and `AttendanceDay` both fit. */
export interface PickableDay {
  /** "YYYY-MM-DD" */
  date: string;
  sectionCount: number;
}

/**
 * เลือกวันเรียนจากปฏิทิน — a month grid where only the days that actually have
 * classes can be pressed.
 *
 * A list of every class day works while there are eight of them and stops
 * working at thirty-six: by March a teacher is scrolling a year of rows to find
 * last Friday. A month grid costs the same space no matter how long the year
 * gets, and it shows the rhythm of the term — "เรียนทุกวันศุกร์" is one glance
 * rather than a read-through.
 *
 * The arrows step between *months that have class days*, never onto an empty
 * October, so every press lands somewhere worth looking at.
 */
export function ClassDayCalendar({
  days,
  today,
  value = null,
  onPick,
  className,
}: {
  /** every class day of the year, ascending */
  days: PickableDay[];
  /** "YYYY-MM-DD" in school time */
  today: string;
  /** the day already chosen, drawn as filled */
  value?: string | null;
  onPick: (date: string) => void;
  className?: string;
}) {
  const months = useMemo(
    () => [...new Set(days.map((d) => d.date.slice(0, 7)))].sort(),
    [days],
  );
  const byDate = useMemo(
    () => new Map(days.map((d) => [d.date, d.sectionCount])),
    [days],
  );

  /** Open on the chosen day, else on the month of the most recent class day. */
  const [month, setMonth] = useState(() => {
    if (value) return value.slice(0, 7);
    const latestPast = [...days].reverse().find((d) => d.date <= today);
    return (latestPast?.date ?? days[0]?.date ?? today).slice(0, 7);
  });

  const at = months.indexOf(month);
  const [year, mon] = month.split('-').map(Number);
  const cells = useMemo(() => monthGrid(year, mon), [year, mon]);
  const inMonth = days.filter((d) => d.date.startsWith(month));

  /** วันเรียนที่ผ่านมาแล้ว ล่าสุดก่อน — the days a forgotten check-in hides in. */
  const recent = [...days].filter((d) => d.date <= today).reverse().slice(0, 4);

  // Capped and centred: the cells are aspect-square, so a full-width container
  // would blow one day up to the size of a card.
  return (
    <div className={cn('mx-auto w-full max-w-sm space-y-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <NavButton
          label="เดือนก่อนหน้าที่มีเรียน"
          disabled={at <= 0}
          onClick={() => setMonth(months[at - 1])}
        >
          <ChevronLeft className="size-4.5" strokeWidth={2} />
        </NavButton>
        <p className="text-sm font-semibold">
          {THAI_MONTHS[mon - 1]} {year + 543}
          <span className="ml-2 font-normal text-muted-foreground">
            {inMonth.length} วันเรียน
          </span>
        </p>
        <NavButton
          label="เดือนถัดไปที่มีเรียน"
          disabled={at < 0 || at >= months.length - 1}
          onClick={() => setMonth(months[at + 1])}
        >
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
        {cells.map((date, i) => {
          if (date === null) return <span key={`b${i}`} />;
          const count = byDate.get(date);
          const day = Number(date.slice(-2));

          if (count === undefined)
            return (
              <span
                key={date}
                className={cn(
                  'grid aspect-square place-items-center text-sm tabular-nums',
                  date === today ? 'font-semibold text-muted-foreground' : 'text-muted-foreground/35',
                )}
              >
                {day}
              </span>
            );

          const chosen = date === value;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onPick(date)}
              aria-pressed={chosen}
              aria-label={`${thaiDateLong(date)} · ${count} กลุ่ม`}
              title={`${thaiDateLong(date)} · ${count} กลุ่ม`}
              className={cn(
                'grid aspect-square place-items-center rounded-lg text-sm font-semibold tabular-nums transition-colors',
                chosen
                  ? 'bg-primary text-primary-foreground'
                  : date === today
                    ? 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/60 hover:bg-primary/20'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/60',
              )}
            >
              {day}
            </button>
          );
        })}
      </div>

      {recent.length > 0 ? (
        <div className="flex flex-wrap items-center justify-center gap-1.5 border-t border-border/60 pt-3">
          <span className="text-xs text-muted-foreground">ล่าสุด</span>
          {recent.map((d) => (
            <button
              key={d.date}
              type="button"
              onClick={() => onPick(d.date)}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                d.date === today
                  ? 'bg-primary text-primary-foreground hover:opacity-90'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/60',
              )}
            >
              {d.date === today
                ? 'วันนี้'
                : `${THAI_WEEKDAYS_SHORT[weekdayOfYmd(d.date)]} ${thaiDateShort(d.date)}`}
            </button>
          ))}
        </div>
      ) : null}

      <p className="text-center text-xs text-muted-foreground">
        กดได้เฉพาะวันที่มีเรียน · ลูกศรข้ามไปเดือนที่มีเรียนถัดไป
      </p>
    </div>
  );
}

function NavButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}
