'use client';

import { useState } from 'react';
import { Check, FileDown, AlertTriangle, Users, CalendarRange } from 'lucide-react';
import { Card, CardHeader, Button, Badge, Select } from '@/components/ui';
import { cn, thaiMonthLabel } from '@/lib/utils';
import { withBasePath } from '@/lib/base-path';

export interface ExportRoom {
  /** "ม.5/2" */
  key: string;
  gradeLevel: string;
  teacherNames: string[];
  studentCount: number;
}

/** Mirrors MAX_STUDENTS in the report route — warn here rather than 400 there. */
const MAX_STUDENTS = 600;

/**
 * ออกรายงาน PDF ห้องที่ปรึกษา — a page of its own rather than a panel wedged
 * above the room being read.
 *
 * The old inline version had to fight for space with the ห้อง table and lost:
 * a tick list of every room in the school, squeezed into one wrapping row. Here
 * the rooms are grouped by ชั้น with a select-all per ชั้น, the month sits next
 * to what it affects, and the export button carries the actual count so nobody
 * generates 600 pages by accident.
 */
export function ExportPanel({
  rooms,
  months,
  initial,
}: {
  rooms: ExportRoom[];
  /** "YYYY-MM" of every month that has class days, ascending */
  months: string[];
  /** rooms to arrive pre-ticked — the one the reader came from, or their own */
  initial: string[];
}) {
  const [picked, setPicked] = useState<string[]>(initial);
  const [month, setMonth] = useState(months[months.length - 1] ?? 'all');

  const chosen = new Set(picked);
  const ordered = rooms.filter((r) => chosen.has(r.key));
  const students = ordered.reduce((n, r) => n + r.studentCount, 0);
  const tooMany = students > MAX_STUDENTS;

  const grades = [...new Set(rooms.map((r) => r.gradeLevel))];

  function toggle(key: string) {
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  }

  function setGrade(grade: string, on: boolean) {
    const keys = rooms.filter((r) => r.gradeLevel === grade).map((r) => r.key);
    setPicked((p) => (on ? [...new Set([...p, ...keys])] : p.filter((k) => !keys.includes(k))));
  }

  const href = withBasePath(
    `/api/homeroom-report?rooms=${encodeURIComponent(ordered.map((r) => r.key).join(','))}` +
      (month === 'all' ? '' : `&month=${month}`),
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={<Users className="size-4.5" strokeWidth={1.8} />}
          title="1 · เลือกห้องที่จะพิมพ์"
          action={
            <div className="flex items-center gap-1.5">
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
                onClick={() => setPicked([])}
                disabled={ordered.length === 0}
              >
                ล้าง
              </Button>
            </div>
          }
        />
        <div className="space-y-4 px-4 pb-5 sm:px-5">
          {grades.map((grade) => {
            const inGrade = rooms.filter((r) => r.gradeLevel === grade);
            const allOn = inGrade.every((r) => chosen.has(r.key));
            return (
              <div key={grade}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{grade}</p>
                  <button
                    type="button"
                    onClick={() => setGrade(grade, !allOn)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {allOn ? `ยกเลิกทั้ง ${grade}` : `เลือกทั้ง ${grade}`}
                  </button>
                </div>
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {inGrade.map((r) => {
                    const on = chosen.has(r.key);
                    return (
                      <li key={r.key}>
                        <button
                          type="button"
                          onClick={() => toggle(r.key)}
                          aria-pressed={on}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                            on
                              ? 'border-primary bg-primary/5'
                              : 'border-border bg-card hover:bg-secondary/60',
                          )}
                        >
                          <span
                            className={cn(
                              'grid size-5 shrink-0 place-items-center rounded-md border',
                              on
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border',
                            )}
                          >
                            {on ? <Check className="size-3.5" strokeWidth={3} /> : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">ห้อง {r.key}</span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {r.studentCount} คน
                              {r.teacherNames.length > 0
                                ? ` · ${r.teacherNames.join(', ')}`
                                : ''}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader
          icon={<CalendarRange className="size-4.5" strokeWidth={1.8} />}
          title="2 · ช่วงเวลาที่จะออกรายงาน"
        />
        <div className="px-4 pb-5 sm:px-5">
          <div className="max-w-sm">
            <label htmlFor="r-month" className="mb-1 block text-xs font-medium text-muted-foreground">
              เดือน
            </label>
            <Select id="r-month" value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="all">ทุกเดือน (คอลัมน์อาจล้นหลายแผ่น)</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {thaiMonthLabel(m)}
                </option>
              ))}
            </Select>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            รายงาน 1 ห้อง = 1 แผ่น (A4 แนวนอน) · แถวเป็นนักเรียน คอลัมน์เป็นวันเรียน
            ใต้แต่ละวันบอกรหัสวิชาและผลของวันนั้น · เกิน 5 วันในเดือนเดียวจะขึ้นแผ่นต่อ
          </p>
        </div>
      </Card>

      {/* Stays in view while scrolling the room list — the decision and the
          button that acts on it must never be a page apart. */}
      <div className="sticky bottom-4 z-10">
        <Card className="flex flex-wrap items-center justify-between gap-3 border-primary/30 p-4 shadow-md">
          <div className="flex items-center gap-3">
            <Badge tone={ordered.length > 0 ? 'navy' : 'secondary'}>
              {ordered.length} ห้อง · {students.toLocaleString('th-TH')} คน
            </Badge>
            <span className="text-xs text-muted-foreground">
              {month === 'all' ? 'ทุกเดือน' : thaiMonthLabel(month)}
            </span>
          </div>
          {tooMany ? (
            <span className="flex items-center gap-2 text-xs text-destructive">
              <AlertTriangle className="size-4" strokeWidth={1.8} />
              เกิน {MAX_STUDENTS} คน — เลือกห้องให้น้อยลงแล้วออกเป็นหลายไฟล์
            </span>
          ) : null}
          {ordered.length === 0 || tooMany ? (
            <Button disabled>
              <FileDown className="size-4.5" strokeWidth={1.8} />
              {ordered.length === 0 ? 'เลือกห้องก่อน' : 'ออกรายงาน (PDF)'}
            </Button>
          ) : (
            <a href={href} target="_blank" rel="noopener noreferrer">
              <Button>
                <FileDown className="size-4.5" strokeWidth={1.8} />
                ออกรายงาน {ordered.length > 1 ? `${ordered.length} ห้อง ` : ''}(PDF)
              </Button>
            </a>
          )}
        </Card>
      </div>
    </div>
  );
}
