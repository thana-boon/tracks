'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChartPie, Download, Route, Search, Users, UsersRound } from 'lucide-react';
import { Badge, Card, CardHeader, EmptyState, Input, Select } from '@/components/ui';
import { SEMESTERS, type Term } from '@/lib/track-core';
import type { ReportStudent, TrackReport } from '@/lib/track-report';
import { cn } from '@/lib/utils';

type Tab = 'tracks' | 'rooms' | 'students';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'tracks', label: 'แยกตาม Track', icon: <Route className="size-4" strokeWidth={1.9} /> },
  { id: 'rooms', label: 'แยกตามห้อง', icon: <UsersRound className="size-4" strokeWidth={1.9} /> },
  { id: 'students', label: 'รายบุคคล', icon: <Users className="size-4" strokeWidth={1.9} /> },
];

function n(v: number) {
  return v.toLocaleString('th-TH');
}

/**
 * The same report in three readings — by สาย, by ห้อง, by คน — because the
 * three questions the ผู้ดูแล brings here have three different shapes, and one
 * table that tried to answer all of them would answer none of them well. The
 * .xlsx carries all three plus a tab per สาย.
 */
export function ReportView({
  report,
  years,
}: {
  report: TrackReport;
  years: { id: number; year: string }[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('tracks');
  const { term, tracks, rooms, totals } = report;

  function goto(yearId: number, semester: number) {
    router.push(`/admin/tracks/report?year=${yearId}&semester=${semester}`);
  }

  const done = totals.students ? Math.round((totals.chosen / totals.students) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">รายงานสรุปการเลือก Track</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ปีการศึกษา {term.year} ภาคเรียนที่ {term.semester} ·{' '}
            <Link
              href={`/admin/tracks/students?year=${term.yearId}&semester=${term.semester}`}
              className="font-medium text-primary hover:underline"
            >
              แก้ไขการเลือกรายคน
            </Link>
          </p>
        </div>
        {/* A plain link, not a button: the file is a navigation the browser
            saves, so it survives a slow query and a mistrusted click alike. */}
        <a
          href={`/api/track-report?year=${term.yearId}&semester=${term.semester}`}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Download className="size-4.5" strokeWidth={1.8} />
          ดาวน์โหลด Excel
        </a>
      </div>

      <Card className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
        <span className="text-sm font-medium">ภาคเรียนที่ดูอยู่</span>
        <Select
          value={term.yearId}
          onChange={(e) => goto(Number(e.target.value), term.semester)}
          className="h-10 w-44"
        >
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              ปีการศึกษา {y.year}
            </option>
          ))}
        </Select>
        <Select
          value={term.semester}
          onChange={(e) => goto(term.yearId, Number(e.target.value))}
          className="h-10 w-36"
        >
          {SEMESTERS.map((s) => (
            <option key={s} value={s}>
              ภาคเรียนที่ {s}
            </option>
          ))}
        </Select>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="นักเรียนทั้งหมด" value={totals.students} />
        <Tile label="เลือกแล้ว" value={totals.chosen} tone="primary" />
        <Tile label="ยังไม่เลือก" value={totals.pending} tone="destructive" />
        <Tile label="ความคืบหน้า" value={`${done}%`} tone="navy" />
      </div>

      {tracks.length === 0 ? (
        <EmptyState
          icon={<Route className="size-8" strokeWidth={1.5} />}
          title={`ยังไม่มี Track ในปีการศึกษา ${term.year} ภาคเรียนที่ ${term.semester}`}
          hint="สร้าง Track ของภาคเรียนนี้ก่อน จึงจะมีอะไรให้สรุป"
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors',
                  tab === t.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card hover:bg-secondary/60',
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'tracks' ? <TrackTab report={report} /> : null}
          {tab === 'rooms' ? <RoomTab report={report} /> : null}
          {tab === 'students' ? <StudentTab report={report} /> : null}
        </>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  tone = 'secondary',
}: {
  label: string;
  value: number | string;
  tone?: 'secondary' | 'primary' | 'destructive' | 'navy';
}) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums',
          tone === 'primary' && 'text-primary',
          tone === 'destructive' && 'text-destructive',
          tone === 'navy' && 'text-navy',
        )}
      >
        {typeof value === 'number' ? n(value) : value}
      </p>
    </Card>
  );
}

/** How many in each สาย, and — opened up — exactly who. */
function TrackTab({ report }: { report: TrackReport }) {
  const [open, setOpen] = useState<number | null>(null);
  const max = Math.max(1, ...report.tracks.map((t) => t.total));

  return (
    <Card>
      <CardHeader
        icon={<ChartPie className="size-4.5" strokeWidth={1.8} />}
        title={`Track ทั้งหมด ${n(report.tracks.length)} สาย`}
        action={<Badge tone="primary">เลือกแล้ว {n(report.totals.chosen)} คน</Badge>}
      />
      <ul className="divide-y divide-border/60 border-t border-border/60">
        {report.tracks.map((t) => {
          const share = report.totals.chosen
            ? Math.round((t.total / report.totals.chosen) * 100)
            : 0;
          const isOpen = open === t.id;
          return (
            <li key={t.id}>
              <button
                onClick={() => setOpen(isOpen ? null : t.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {t.name}
                    {!t.active ? <Badge tone="secondary">ปิดไม่ให้เลือก</Badge> : null}
                    {t.byGrade.map((g) => (
                      <span key={g.grade} className="text-xs font-normal text-muted-foreground">
                        {g.grade} {n(g.count)}
                      </span>
                    ))}
                  </p>
                  {/* The bar is the ranking made visible — the one thing a
                      count column cannot show at a glance. */}
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(t.total / max) * 100}%` }}
                    />
                  </div>
                  {t.options.length ? (
                    <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      {t.options.map((o) => (
                        <span key={o.id}>
                          {o.name} {n(o.count)}
                        </span>
                      ))}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-semibold tabular-nums">{n(t.total)}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{share}%</p>
                </div>
              </button>
              {isOpen ? (
                t.students.length ? (
                  <ul className="divide-y divide-border/40 border-t border-border/40 bg-secondary/20">
                    {t.students.map((s) => (
                      <StudentLine key={s.id} s={s} showOption />
                    ))}
                  </ul>
                ) : (
                  <p className="border-t border-border/40 bg-secondary/20 px-5 py-6 text-center text-sm text-muted-foreground">
                    ยังไม่มีนักเรียนเลือกสายนี้
                  </p>
                )
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** ห้อง × สาย — the table a ครูที่ปรึกษา reads across their own row. */
function RoomTab({ report }: { report: TrackReport }) {
  const { rooms, tracks } = report;
  return (
    <Card>
      <CardHeader
        icon={<UsersRound className="size-4.5" strokeWidth={1.8} />}
        title={`ห้องเรียน ${n(rooms.length)} ห้อง`}
      />
      {/* One column per สาย overflows a phone long before it overflows the
          data — the table scrolls itself rather than the page. */}
      <div className="overflow-x-auto border-t border-border/60">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="bg-secondary/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">ห้อง</th>
              <th className="px-3 py-2 text-center font-medium">นักเรียน</th>
              <th className="px-3 py-2 text-center font-medium">ยังไม่เลือก</th>
              {tracks.map((t) => (
                <th key={t.id} className="px-3 py-2 text-center font-medium">
                  {t.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rooms.map((r) => (
              <tr key={`${r.gradeLevel}/${r.classroom}`} className="hover:bg-secondary/30">
                <td className="whitespace-nowrap px-3 py-2 font-medium">
                  {r.gradeLevel}/{r.classroom}
                </td>
                <td className="px-3 py-2 text-center tabular-nums">{n(r.total)}</td>
                <td
                  className={cn(
                    'px-3 py-2 text-center tabular-nums',
                    r.pending > 0 ? 'font-medium text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {n(r.pending)}
                </td>
                {tracks.map((t) => {
                  const c = r.byTrack.find((x) => x.trackId === t.id)?.count ?? 0;
                  return (
                    <td
                      key={t.id}
                      className={cn(
                        'px-3 py-2 text-center tabular-nums',
                        c === 0 && 'text-muted-foreground/40',
                      )}
                    >
                      {n(c)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

type StudentFilter = 'all' | 'chosen' | 'pending';

/** Every นักเรียน and what they picked — searchable, and the answer to "ของคนนี้?" */
function StudentTab({ report }: { report: TrackReport }) {
  const [q, setQ] = useState('');
  const [grade, setGrade] = useState('all');
  const [trackId, setTrackId] = useState<StudentFilter | string>('all');

  const grades = useMemo(
    () =>
      [...new Set(report.students.map((s) => s.gradeLevel).filter(Boolean) as string[])].sort(),
    [report.students],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return report.students.filter((s) => {
      if (grade !== 'all' && s.gradeLevel !== grade) return false;
      if (trackId === 'pending' && s.trackName) return false;
      if (trackId !== 'all' && trackId !== 'pending' && String(s.trackId) !== trackId) return false;
      if (!needle) return true;
      return (
        s.fullName.toLowerCase().includes(needle) ||
        s.code.toLowerCase().includes(needle) ||
        (s.nickname ?? '').toLowerCase().includes(needle)
      );
    });
  }, [report.students, q, grade, trackId]);

  return (
    <Card>
      <CardHeader
        icon={<Users className="size-4.5" strokeWidth={1.8} />}
        title={`นักเรียน ${n(shown.length)} คน`}
      />
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 pb-4 sm:px-5">
        <div className="relative min-w-40 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.8}
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อ / รหัส / ชื่อเล่น"
            className="h-10 pl-9"
          />
        </div>
        <Select value={grade} onChange={(e) => setGrade(e.target.value)} className="h-10 w-28">
          <option value="all">ทุกชั้น</option>
          {grades.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </Select>
        <Select
          value={trackId}
          onChange={(e) => setTrackId(e.target.value)}
          className="h-10 w-44"
        >
          <option value="all">ทุก Track</option>
          <option value="pending">ยังไม่เลือก</option>
          {report.tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </div>
      {shown.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          ไม่พบนักเรียนตามเงื่อนไข
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {shown.map((s) => (
            <StudentLine key={s.id} s={s} showTrack showOption />
          ))}
        </ul>
      )}
    </Card>
  );
}

function StudentLine({
  s,
  showTrack = false,
  showOption = false,
}: {
  s: ReportStudent;
  showTrack?: boolean;
  showOption?: boolean;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
      <span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">{s.code}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {s.fullName}
          {s.nickname ? <span className="text-muted-foreground"> ({s.nickname})</span> : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {s.gradeLevel}/{s.classroom}
          {s.classNumber ? ` เลขที่ ${s.classNumber}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        {showTrack ? (
          s.trackName ? (
            <Badge tone="primary">{s.trackName}</Badge>
          ) : (
            <Badge tone="secondary">ยังไม่เลือก</Badge>
          )
        ) : null}
        {showOption && s.optionName ? <Badge tone="navy">{s.optionName}</Badge> : null}
        {s.byAdmin ? <Badge tone="accent">ผู้ดูแลกำหนด</Badge> : null}
      </div>
    </li>
  );
}
