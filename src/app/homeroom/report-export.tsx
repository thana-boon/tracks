'use client';

import { useState } from 'react';
import { Check, FileDown } from 'lucide-react';
import { Card, CardHeader, Button, Badge, Select } from '@/components/ui';
import { cn, thaiMonthLabel } from '@/lib/utils';

export interface ExportRoom {
  key: string;
  studentCount: number;
}

/**
 * Choosing what goes into the PDF — several ห้อง at once if wanted. Its ticks
 * are local state, so building a batch here never navigates and never disturbs
 * the room being read on screen. It opens on the room in view, which is the
 * common case: look at a ห้อง, print that ห้อง.
 */
export function ReportExport({
  rooms,
  months,
  viewing,
}: {
  rooms: ExportRoom[];
  /** "YYYY-MM" of every month that has class days, ascending */
  months: string[];
  /** the ห้อง the page is currently showing */
  viewing: string;
}) {
  const [picked, setPicked] = useState<string[]>([viewing]);
  const [month, setMonth] = useState(months[months.length - 1] ?? 'all');

  const chosen = new Set(picked);
  const ordered = rooms.filter((r) => chosen.has(r.key)).map((r) => r.key);
  const students = rooms
    .filter((r) => chosen.has(r.key))
    .reduce((n, r) => n + r.studentCount, 0);

  const href =
    `/api/homeroom-report?rooms=${encodeURIComponent(ordered.join(','))}` +
    (month === 'all' ? '' : `&month=${month}`);

  return (
    <Card>
      <CardHeader
        icon={<FileDown className="size-4.5" strokeWidth={1.8} />}
        title="ออกรายงาน PDF"
        action={
          <Badge tone={ordered.length > 0 ? 'navy' : 'secondary'}>
            {ordered.length} ห้อง · {students} คน
          </Badge>
        }
      />
      <div className="px-4 pb-4 sm:px-5">
        <p className="pb-2 text-xs text-muted-foreground">
          ติ๊กห้องที่จะพิมพ์ — เลือกกี่ห้องก็ได้ ไม่กระทบห้องที่กำลังดูอยู่ด้านล่าง
        </p>
        <ul className="flex flex-wrap gap-2">
          {rooms.map((r) => {
            const on = chosen.has(r.key);
            return (
              <li key={r.key}>
                <button
                  type="button"
                  onClick={() =>
                    setPicked((p) => (on ? p.filter((k) => k !== r.key) : [...p, r.key]))
                  }
                  aria-pressed={on}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors',
                    on
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card hover:bg-secondary/60',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-4 shrink-0 place-items-center rounded border',
                      on ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                    )}
                  >
                    {on ? <Check className="size-2.5" strokeWidth={3.5} /> : null}
                  </span>
                  ห้อง {r.key}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setPicked(rooms.map((r) => r.key))}
            disabled={ordered.length === rooms.length}
          >
            เลือกทุกห้อง
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setPicked([viewing])}
            disabled={ordered.length === 1 && ordered[0] === viewing}
          >
            เฉพาะห้องที่กำลังดู
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-secondary/30 p-3">
          <div className="min-w-44 flex-1">
            <label
              htmlFor="r-month"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              เดือนที่จะออกรายงาน
            </label>
            <Select
              id="r-month"
              className="h-10 bg-card"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            >
              <option value="all">ทุกเดือน (คอลัมน์อาจล้นหลายแผ่น)</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {thaiMonthLabel(m)}
                </option>
              ))}
            </Select>
          </div>
          {ordered.length === 0 ? (
            <Button size="md" disabled>
              <FileDown className="size-4.5" strokeWidth={1.8} /> ติ๊กห้องก่อน
            </Button>
          ) : (
            <a href={href} target="_blank" rel="noopener noreferrer">
              <Button size="md">
                <FileDown className="size-4.5" strokeWidth={1.8} /> ออกรายงาน{' '}
                {ordered.length > 1 ? `${ordered.length} ห้อง ` : ''}(PDF)
              </Button>
            </a>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          รายงาน 1 ห้อง = 1 แผ่น (A4 แนวตั้ง) · แถวเป็นนักเรียน คอลัมน์เป็นวันที่ ใต้แต่ละวันบอกรหัสวิชาที่เรียนและผลของวันนั้น · เกิน 5 วันในเดือนเดียวจะขึ้นแผ่นต่อ
        </p>
      </div>
    </Card>
  );
}
