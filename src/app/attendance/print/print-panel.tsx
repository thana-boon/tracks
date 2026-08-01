'use client';

import { useMemo, useState } from 'react';
import { Printer, FileDown, Check, MapPin, AlertTriangle, Loader2 } from 'lucide-react';
import { Card, CardHeader, Button, Select, Label, Badge } from '@/components/ui';
import {
  cn,
  thaiDateShort,
  THAI_MONTHS,
  THAI_WEEKDAYS_SHORT,
  weekdayOfYmd,
} from '@/lib/utils';
import { withBasePath } from '@/lib/base-path';

export interface PrintSection {
  id: number;
  name: string;
  subjectCode: string;
  subjectName: string;
  groupCode: string;
  groupName: string;
  room: string | null;
  studentCount: number;
  classDates: string[];
}

/** Mirrors MAX_SECTIONS in the sheet route — warn here rather than 400 there. */
const MAX_SECTIONS = 120;

export function PrintPanel({
  sections,
  current,
}: {
  sections: PrintSection[];
  current: number[];
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set(current));
  const [group, setGroup] = useState<string>('all');
  const [date, setDate] = useState<string>('all');
  const [columns, setColumns] = useState(16);
  const [building, setBuilding] = useState(false);

  const groups = useMemo(
    () => [...new Map(sections.map((s) => [s.groupCode, s.groupName])).entries()],
    [sections],
  );

  // หมวด narrows first, so the วันเรียน list only offers days that หมวด actually
  // teaches — picking a หมวด never leaves a dead date selected.
  const inGroup = useMemo(
    () => (group === 'all' ? sections : sections.filter((s) => s.groupCode === group)),
    [sections, group],
  );
  const dates = useMemo(
    () => [...new Set(inGroup.flatMap((s) => s.classDates))].sort(),
    [inGroup],
  );
  // Dates are grouped by month in the dropdown: a หมวด that has run all year
  // ends up with dozens of days, and the month headings keep them findable.
  const months = useMemo(() => {
    const by = new Map<string, string[]>();
    for (const d of dates) {
      const key = d.slice(0, 7);
      by.set(key, [...(by.get(key) ?? []), d]);
    }
    return [...by.entries()];
  }, [dates]);

  // A date left over from a wider หมวด falls back to "ทุกวัน" rather than hiding
  // every row.
  const activeDate = date !== 'all' && dates.includes(date) ? date : 'all';
  const shown = useMemo(
    () =>
      activeDate === 'all'
        ? inGroup
        : inGroup.filter((s) => s.classDates.includes(activeDate)),
    [inGroup, activeDate],
  );

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function bulk(select: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of shown) select ? next.add(s.id) : next.delete(s.id);
      return next;
    });
  }

  const allShownSelected = shown.length > 0 && shown.every((s) => selected.has(s.id));
  // Ticks survive a filter change, so say so — otherwise the PDF comes out with
  // pages for รอบ that are not on screen.
  const hiddenSelected = selected.size - shown.filter((s) => selected.has(s.id)).length;
  const href = withBasePath(
    `/api/attendance-sheet?sections=${[...selected].join(',')}&columns=${columns}`,
  );
  const tooMany = selected.size > MAX_SECTIONS;

  // The sheet opens in a new tab, which stays blank while the server lays the
  // pages out. Saying so — and briefly locking the button — is what stops the
  // second and third press that would only queue more of the same work.
  function startBuild() {
    setBuilding(true);
    setTimeout(() => setBuilding(false), 6000);
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader
        icon={<Printer className="size-4.5" strokeWidth={1.8} />}
        title="เลือกกลุ่มเรียนที่จะพิมพ์"
        action={<Badge tone="navy">{selected.size} รอบ</Badge>}
      />
      <div className="space-y-4 px-4 pb-5 sm:px-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-44 flex-1">
            <Label htmlFor="p-group">หมวด</Label>
            <Select id="p-group" value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="all">ทุกหมวด</option>
              {groups.map(([code, name]) => (
                <option key={code} value={code}>
                  {code} · {name}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-44 flex-1">
            <Label htmlFor="p-date">วันเรียน</Label>
            <Select
              id="p-date"
              value={activeDate}
              onChange={(e) => setDate(e.target.value)}
              disabled={dates.length === 0}
            >
              <option value="all">ทุกวัน</option>
              {months.map(([key, days]) => (
                <optgroup
                  key={key}
                  label={`${THAI_MONTHS[Number(key.slice(5, 7)) - 1]} ${Number(key.slice(0, 4)) + 543}`}
                >
                  {days.map((d) => (
                    <option key={d} value={d}>
                      {THAI_WEEKDAYS_SHORT[weekdayOfYmd(d)]} {thaiDateShort(d)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
          <Button variant="secondary" onClick={() => bulk(!allShownSelected)}>
            {allShownSelected ? 'ยกเลิกที่แสดง' : 'เลือกที่แสดงทั้งหมด'}
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>
            แสดง {shown.length} จาก {sections.length} รอบ
            {activeDate === 'all' ? '' : ` · ที่เรียนวัน${thaiDateShort(activeDate)}`}
          </p>
          {hiddenSelected > 0 ? (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="font-medium text-primary hover:underline"
            >
              เลือกไว้นอกตัวกรองอีก {hiddenSelected} รอบ — ล้างที่เลือกทั้งหมด
            </button>
          ) : null}
        </div>

        <ul className="max-h-[26rem] divide-y divide-border/60 overflow-y-auto rounded-xl border border-border">
          {shown.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              ไม่มีรอบเรียนที่ตรงกับตัวกรองนี้
            </li>
          ) : null}
          {shown.map((s) => {
            const on = selected.has(s.id);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => toggle(s.id)}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                    on ? 'bg-primary/5' : 'hover:bg-secondary/50',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-5 shrink-0 place-items-center rounded-md border',
                      on ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                    )}
                  >
                    {on ? <Check className="size-3.5" strokeWidth={3} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="truncate font-medium">
                        {s.subjectCode} — {s.subjectName}
                      </span>
                      <Badge tone="navy">{s.name}</Badge>
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                      <span>{s.groupCode}</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3.5" strokeWidth={1.8} />
                        {s.room ?? 'ยังไม่ระบุห้อง'}
                      </span>
                      <span>{s.studentCount} คน</span>
                      {s.classDates.length > 0 ? (
                        <span className="flex flex-wrap items-center gap-x-1">
                          {s.classDates.map((d, i) => (
                            <span
                              key={d}
                              className={cn(d === activeDate && 'font-semibold text-primary')}
                            >
                              {thaiDateShort(d)}
                              {i < s.classDates.length - 1 ? ',' : ''}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span>ยังไม่กำหนดวันเรียน</span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div>
          <Label htmlFor="p-cols">จำนวนช่องเช็คชื่อ (ช่องตารางเปล่า)</Label>
          <Select
            id="p-cols"
            value={columns}
            onChange={(e) => setColumns(Number(e.target.value))}
            className="max-w-48"
          >
            {[6, 12, 16].map((n) => (
              <option key={n} value={n}>
                {n} ช่อง
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            ช่องกว้างประมาณ 5.6 มม. เท่ากันทุกแบบ — เลือกน้อยลง คอลัมน์ชื่อจะกว้างขึ้น
          </p>
        </div>

        {tooMany ? (
          <p className="flex items-center justify-center gap-2 text-xs text-destructive">
            <AlertTriangle className="size-4" strokeWidth={1.8} />
            เลือกไว้ {selected.size} รอบ — เกิน {MAX_SECTIONS} รอบต่อไฟล์ กรุณาแบ่งพิมพ์เป็นหลายครั้ง
          </p>
        ) : null}
        <a
          href={selected.size && !tooMany ? href : undefined}
          target="_blank"
          rel="noopener noreferrer"
          onClick={startBuild}
          className={cn('block', (!selected.size || tooMany) && 'pointer-events-none')}
        >
          <Button className="w-full" disabled={selected.size === 0 || tooMany}>
            {building ? (
              <Loader2 className="size-4.5 animate-spin" />
            ) : (
              <FileDown className="size-4.5" strokeWidth={1.8} />
            )}
            {building ? 'กำลังสร้างเอกสาร…' : `เปิดใบเช็คชื่อ (PDF) · ${selected.size} หน้า`}
          </Button>
        </a>
        <p className="text-center text-xs text-muted-foreground">
          A4 แนวตั้ง หน้าละ 1 กลุ่ม — เลือกหลายกลุ่มได้ ระบบจะรวมเป็นไฟล์เดียว ·
          เอกสารจะเปิดในแท็บใหม่ ยิ่งหลายรอบยิ่งใช้เวลาสร้างนานขึ้น
        </p>
      </div>
    </Card>
  );
}
