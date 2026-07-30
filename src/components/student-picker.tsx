'use client';

import { useMemo, useState } from 'react';
import { Search, Check } from 'lucide-react';
import { Input, Select } from './ui';
import { cn } from '@/lib/utils';

export interface PickStudent {
  id: number;
  code: string;
  fullName: string;
  nickname: string | null;
  gradeLevel: string | null;
  classroom: string | null;
  classNumber: number | null;
}

/**
 * Multi-select student list with grade/room filters and a search box. Controlled
 * via `selected` (a Set of ids) + `onToggle`. Used by both the custom-classroom
 * editor and the subject-assignment screen.
 */
export function StudentPicker({
  students,
  selected,
  onToggle,
  onBulk,
  height = 'h-96',
}: {
  students: PickStudent[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onBulk?: (ids: number[], select: boolean) => void;
  height?: string;
}) {
  const [q, setQ] = useState('');
  const [grade, setGrade] = useState('all');
  const [room, setRoom] = useState('all');

  const grades = useMemo(
    () => [...new Set(students.map((s) => s.gradeLevel).filter(Boolean) as string[])].sort(),
    [students],
  );
  const rooms = useMemo(
    () =>
      [...new Set(
        students
          .filter((s) => grade === 'all' || s.gradeLevel === grade)
          .map((s) => s.classroom)
          .filter(Boolean) as string[],
      )].sort((a, b) => a.localeCompare(b, 'th', { numeric: true })),
    [students, grade],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return students.filter((s) => {
      if (grade !== 'all' && s.gradeLevel !== grade) return false;
      if (room !== 'all' && s.classroom !== room) return false;
      if (!needle) return true;
      return (
        s.fullName.toLowerCase().includes(needle) ||
        s.code.toLowerCase().includes(needle) ||
        (s.nickname ?? '').toLowerCase().includes(needle)
      );
    });
  }, [students, q, grade, room]);

  const shownIds = shown.map((s) => s.id);
  const allShownSelected = shownIds.length > 0 && shownIds.every((id) => selected.has(id));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.8} />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ / รหัส / ชื่อเล่น" className="h-10 pl-9" />
        </div>
        <Select value={grade} onChange={(e) => { setGrade(e.target.value); setRoom('all'); }} className="h-10 w-28">
          <option value="all">ทุกชั้น</option>
          {grades.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </Select>
        <Select value={room} onChange={(e) => setRoom(e.target.value)} className="h-10 w-28">
          <option value="all">ทุกห้อง</option>
          {rooms.map((r) => (
            <option key={r} value={r}>ห้อง {r}</option>
          ))}
        </Select>
      </div>

      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <span>แสดง {shown.length.toLocaleString('th-TH')} คน · เลือก {selected.size.toLocaleString('th-TH')} คน</span>
        {onBulk && shownIds.length > 0 ? (
          <button
            type="button"
            onClick={() => onBulk(shownIds, !allShownSelected)}
            className="font-medium text-primary hover:underline"
          >
            {allShownSelected ? 'ยกเลิกที่แสดง' : 'เลือกที่แสดงทั้งหมด'}
          </button>
        ) : null}
      </div>

      <div className={cn('overflow-y-auto rounded-xl border border-border', height)}>
        {shown.length === 0 ? (
          <p className="grid h-full place-items-center px-4 text-center text-sm text-muted-foreground">
            ไม่พบนักเรียนตามเงื่อนไข
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {shown.map((s) => {
              const on = selected.has(s.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onToggle(s.id)}
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
                    <span className="w-16 shrink-0 text-xs text-muted-foreground tabular-nums">{s.code}</span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {s.fullName}
                      {s.nickname ? <span className="text-muted-foreground"> ({s.nickname})</span> : null}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {s.gradeLevel}/{s.classroom}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
