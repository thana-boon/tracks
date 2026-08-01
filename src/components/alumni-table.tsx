'use client';

import * as React from 'react';
import { FileText, Search, UserRoundX } from 'lucide-react';
import type { AlumniRow } from '@/lib/alumni';
import { Badge, Button, EmptyState, Input, Select } from '@/components/ui';

/**
 * รายชื่อนักเรียนที่จบ/ลาออก — อ่านอย่างเดียว
 *
 * Filtering is client-side on purpose: the whole cohort arrives in one payload
 * (a few hundred rows at most) and typing a name should not cost a round trip.
 * Printing reuses /api/transcript untouched — it selects students by id and
 * never filters on status, so a leaver's sheet builds exactly like anyone's.
 */
export function AlumniTable({
  rows,
  grades,
  emptyTitle,
  emptyHint,
}: {
  rows: AlumniRow[];
  grades: string[];
  emptyTitle: string;
  emptyHint: string;
}) {
  const [q, setQ] = React.useState('');
  const [grade, setGrade] = React.useState('all');

  const shown = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (grade !== 'all' && r.gradeLevel !== grade) return false;
      if (!needle) return true;
      return (
        r.code.toLowerCase().includes(needle) ||
        r.fullName.toLowerCase().includes(needle) ||
        (r.nickname ?? '').toLowerCase().includes(needle)
      );
    });
  }, [rows, q, grade]);

  if (rows.length === 0)
    return (
      <EmptyState
        icon={<UserRoundX className="size-8" strokeWidth={1.5} />}
        title={emptyTitle}
        hint={emptyHint}
      />
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาด้วยรหัส ชื่อ หรือชื่อเล่น"
            className="pl-9"
          />
        </div>
        <Select value={grade} onChange={(e) => setGrade(e.target.value)} className="w-40">
          <option value="all">ทุกชั้น</option>
          {grades.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </Select>
        <span className="text-sm text-muted-foreground">
          {shown.length === rows.length
            ? `${rows.length} คน`
            : `${shown.length} จาก ${rows.length} คน`}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="border-b border-border bg-secondary/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">รหัส</th>
              <th className="px-4 py-3 font-medium">ชื่อ-สกุล</th>
              <th className="px-4 py-3 font-medium">ชั้นสุดท้าย</th>
              <th className="px-4 py-3 font-medium">ปีที่เรียน</th>
              <th className="px-4 py-3 font-medium">วิชาที่ผ่าน</th>
              <th className="px-4 py-3 text-right font-medium">ทรานสคริปต์</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{r.code}</td>
                <td className="px-4 py-3">
                  {r.fullName}
                  {r.nickname ? (
                    <span className="ml-1 text-muted-foreground">({r.nickname})</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {r.gradeLevel ?? '—'}
                  {r.classroom ? `/${r.classroom}` : ''}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {r.years.length > 0 ? r.years.join(', ') : '—'}
                </td>
                <td className="px-4 py-3">
                  {r.passedCount > 0 ? (
                    <Badge tone="success">{r.passedCount} วิชา</Badge>
                  ) : (
                    <span className="text-muted-foreground">ไม่มี</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {r.passedCount > 0 ? (
                    <a
                      href={`/api/transcript?students=${r.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="outline" size="sm">
                        <FileText className="size-4" strokeWidth={1.8} />
                        พิมพ์
                      </Button>
                    </a>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      title="ไม่มีวิชาที่ผ่าน จึงยังไม่มีอะไรให้พิมพ์"
                    >
                      <FileText className="size-4" strokeWidth={1.8} />
                      พิมพ์
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {shown.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">ไม่พบนักเรียนที่ตรงกับที่ค้นหา</p>
      ) : null}
    </div>
  );
}
