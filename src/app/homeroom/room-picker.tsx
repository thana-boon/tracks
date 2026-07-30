'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, FileDown, Loader2, Users } from 'lucide-react';
import { Card, CardHeader, Button, Badge, Select } from '@/components/ui';
import { cn, thaiMonthLabel } from '@/lib/utils';

export interface PickerRoom {
  key: string;
  teacherNames: string[];
  studentCount: number;
}

/**
 * Which ห้องที่ปรึกษา an admin is looking at. The choice lives in `?rooms=`, so
 * the tables below are plain server-rendered output and the export link is
 * always exactly what is on screen — tick several rooms and one PDF covers all
 * of them.
 */
export function RoomPicker({
  rooms,
  selected,
  months,
}: {
  rooms: PickerRoom[];
  selected: string[];
  /** "YYYY-MM" of every month that has class days, ascending */
  months: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  // The month only scopes the export, so it never has to reach the server.
  const [month, setMonth] = useState(months[months.length - 1] ?? 'all');

  const chosen = new Set(selected);

  function go(keys: string[]) {
    // Keep the room order stable so the same selection always yields one URL.
    const ordered = rooms.filter((r) => keys.includes(r.key)).map((r) => r.key);
    const next = new URLSearchParams(params);
    if (ordered.length > 0) next.set('rooms', ordered.join(','));
    else next.delete('rooms');
    start(() => router.push(`/homeroom?${next.toString()}`));
  }

  function toggle(key: string) {
    go(chosen.has(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  }

  const exportHref =
    `/api/homeroom-report?rooms=${encodeURIComponent(selected.join(','))}` +
    (month === 'all' ? '' : `&month=${month}`);
  const students = rooms
    .filter((r) => chosen.has(r.key))
    .reduce((n, r) => n + r.studentCount, 0);

  return (
    <Card>
      <CardHeader
        icon={<Users className="size-4.5" strokeWidth={1.8} />}
        title="เลือกห้อง"
        action={
          <div className="flex items-center gap-2">
            {pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
            <Badge tone={selected.length > 0 ? 'navy' : 'secondary'}>
              เลือก {selected.length} ห้อง · {students} คน
            </Badge>
          </div>
        }
      />
      <div className="px-4 pb-4 sm:px-5">
        <ul className="flex flex-wrap gap-2">
          {rooms.map((r) => {
            const on = chosen.has(r.key);
            return (
              <li key={r.key}>
                <button
                  type="button"
                  onClick={() => toggle(r.key)}
                  aria-pressed={on}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                    on
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card hover:bg-secondary/60',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-4.5 shrink-0 place-items-center rounded border',
                      on ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                    )}
                  >
                    {on ? <Check className="size-3" strokeWidth={3} /> : null}
                  </span>
                  <span>
                    <span className="font-medium">ห้อง {r.key}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {r.studentCount} คน
                      {r.teacherNames.length > 0 ? ` · ครู ${r.teacherNames.join(', ')}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => go(rooms.map((r) => r.key))}
            disabled={selected.length === rooms.length}
          >
            เลือกทุกห้อง
          </Button>
          <Button size="sm" variant="ghost" onClick={() => go([])} disabled={selected.length === 0}>
            ล้างการเลือก
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-secondary/30 p-3">
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
          {selected.length === 0 ? (
            <Button size="md" disabled>
              <FileDown className="size-4.5" strokeWidth={1.8} /> เลือกห้องก่อน
            </Button>
          ) : (
            <a href={exportHref} target="_blank" rel="noopener noreferrer">
              <Button size="md">
                <FileDown className="size-4.5" strokeWidth={1.8} /> ออกรายงาน{' '}
                {selected.length > 1 ? `${selected.length} ห้อง ` : ''}(PDF)
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
