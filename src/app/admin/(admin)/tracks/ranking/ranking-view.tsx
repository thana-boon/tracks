'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, BookOpen, CalendarRange, RefreshCw, Search, Trophy } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, Input, Select } from '@/components/ui';
import { SEMESTERS, type Term } from '@/lib/track-core';
import {
  rankBy,
  tally,
  type ScoreCell,
  type ScorePeriod,
  type ScoreSubject,
} from '@/lib/score-rank';
import { cn, sortGrades, thaiDateTimeLongOf } from '@/lib/utils';
import { refreshScores } from './actions';

export interface RankTrack {
  id: number;
  name: string;
  options: { id: number; name: string }[];
}

export interface RankStudent {
  id: number;
  code: string;
  fullName: string;
  nickname: string | null;
  gradeLevel: string | null;
  classroom: string | null;
  classNumber: number | null;
  trackId: number | null;
  trackName: string | null;
  optionId: number | null;
  optionName: string | null;
  cells: ScoreCell[];
}

/** "grade" = ทั้งชั้น; "track:7" = ใน Track; "option:12" = ในข้อย่อย */
type Scope = string;

function n(v: number) {
  return v.toLocaleString('th-TH');
}

function pct(v: number | null) {
  return v === null ? '–' : v.toFixed(2);
}

export function RankingView({
  term,
  years,
  tracks,
  students,
  periods,
  subjects,
  fetchedAt,
  error,
}: {
  term: Term;
  years: { id: number; year: string }[];
  tracks: RankTrack[];
  students: RankStudent[];
  periods: ScorePeriod[];
  subjects: ScoreSubject[];
  fetchedAt: string | null;
  error: { code: string; message: string } | null;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [scope, setScope] = useState<Scope>(tracks.length ? `track:${tracks[0].id}` : 'grade');
  const [grade, setGrade] = useState<string>('');
  // Unticked rather than ticked, for ช่วงสอบ and วิชา alike: one that shows up
  // on the next ดึงคะแนน is counted until somebody says otherwise.
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const [dropped, setDropped] = useState<Set<string>>(() => new Set());
  const [q, setQ] = useState('');

  function goto(yearId: number, semester: number) {
    router.push(`/admin/tracks/ranking?year=${yearId}&semester=${semester}`);
  }

  // Who the scope holds, before the ชั้น cut.
  const inScope = useMemo(() => {
    const [kind, id] = scope.split(':');
    if (kind === 'track') return students.filter((s) => s.trackId === Number(id));
    if (kind === 'option') return students.filter((s) => s.optionId === Number(id));
    return students;
  }, [students, scope]);

  const grades = useMemo(() => sortGrades(inScope.map((s) => s.gradeLevel)), [inScope]);
  // A ชั้น that is not in this scope falls back to its first; "all" is only
  // offered where it means something, inside a Track.
  const gradeNow =
    grade === 'all' && scope !== 'grade' ? 'all' : grades.includes(grade) ? grade : (grades[0] ?? '');

  const group = useMemo(
    () => (gradeNow === 'all' ? inScope : inScope.filter((s) => s.gradeLevel === gradeNow)),
    [inScope, gradeNow],
  );

  // Only the วิชา somebody in the group actually sat — ม.5's วิชา have no place
  // in a list of ticks for ม.4.
  const groupSubjects = useMemo(() => {
    const keys = new Set(group.flatMap((s) => s.cells.map((c) => c.subject)));
    return subjects.filter((s) => keys.has(s.key));
  }, [group, subjects]);

  const counted = useMemo(
    () => new Set(groupSubjects.filter((s) => !dropped.has(s.key)).map((s) => s.key)),
    [groupSubjects, dropped],
  );
  const shownPeriods = useMemo(() => periods.filter((p) => !skipped.has(p.key)), [periods, skipped]);

  const ranked = useMemo(() => {
    const picked = new Set(shownPeriods.map((p) => p.key));
    const rows = group.map((s) => ({
      ...s,
      total: tally(s.cells, picked, counted),
      byPeriod: shownPeriods.map((p) => tally(s.cells, new Set([p.key]), counted).percent),
    }));
    return rankBy(rows, (r) => r.total.percent);
  }, [group, shownPeriods, counted]);

  const withScore = ranked.filter((r) => r.rank !== null);
  const mean = withScore.length
    ? withScore.reduce((sum, r) => sum + r.total.percent!, 0) / withScore.length
    : null;

  // The search narrows the list, never the อันดับ — "คนนี้ที่เท่าไร" must read
  // the same with or without it.
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return ranked;
    return ranked.filter(
      (s) =>
        s.fullName.toLowerCase().includes(needle) ||
        s.code.toLowerCase().includes(needle) ||
        (s.nickname ?? '').toLowerCase().includes(needle) ||
        `${s.gradeLevel}/${s.classroom}`.includes(needle),
    );
  }, [ranked, q]);

  function togglePeriod(key: string) {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSubject(key: string) {
    setDropped((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const scopeLabel = scope.startsWith('track:')
    ? tracks.find((t) => `track:${t.id}` === scope)?.name
    : scope.startsWith('option:')
      ? tracks.flatMap((t) => t.options.map((o) => ({ t, o }))).find(({ o }) => `option:${o.id}` === scope)
          ?.o.name
      : 'ทั้งชั้น';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">จัดอันดับคะแนนสอบ</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            คะแนนกลางภาค/ปลายภาคจากระบบคะแนน ปีการศึกษา {term.year} · แปลงแต่ละวิชาเป็นร้อยละก่อน
            แล้วเฉลี่ยทุกวิชาของช่วงสอบที่เลือก ·{' '}
            <Link
              href={`/admin/tracks/report?year=${term.yearId}&semester=${term.semester}`}
              className="font-medium text-primary hover:underline"
            >
              รายงานสรุป Track
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {fetchedAt ? (
            <span className="text-xs text-muted-foreground">
              ดึงเมื่อ {thaiDateTimeLongOf(new Date(fetchedAt))}
            </span>
          ) : null}
          <Button
            variant="outline"
            disabled={refreshing}
            onClick={() =>
              startRefresh(async () => {
                await refreshScores(term.year);
                router.refresh();
              })
            }
          >
            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} strokeWidth={1.8} />
            ดึงคะแนนล่าสุด
          </Button>
        </div>
      </div>

      <Card className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
        <span className="text-sm font-medium">Track ของ</span>
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
        <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <span className="text-sm font-medium">จัดอันดับใน</span>
        <Select value={scope} onChange={(e) => setScope(e.target.value)} className="h-10 w-56">
          <option value="grade">ทั้งชั้น (ไม่แยก Track)</option>
          {tracks.map((t) => (
            <optgroup key={t.id} label={t.name}>
              <option value={`track:${t.id}`}>{t.name} — ทั้งสาย</option>
              {t.options.map((o) => (
                <option key={o.id} value={`option:${o.id}`}>
                  {t.name} › {o.name}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        <Select value={gradeNow} onChange={(e) => setGrade(e.target.value)} className="h-10 w-36">
          {grades.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
          {scope !== 'grade' && grades.length > 1 ? <option value="all">ทุกชั้นรวมกัน</option> : null}
        </Select>
      </Card>

      {error ? (
        <Card className="flex items-start gap-3 border-destructive/40 p-4 sm:p-5">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" strokeWidth={1.8} />
          <div className="min-w-0">
            <p className="text-sm font-medium">ดึงคะแนนจากระบบคะแนนไม่สำเร็จ</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{error.message}</p>
            <p className="mt-1 text-xs text-muted-foreground">รหัส: {error.code}</p>
          </div>
        </Card>
      ) : periods.length === 0 ? (
        <EmptyState
          icon={<CalendarRange className="size-8" strokeWidth={1.5} />}
          title={`ยังไม่มีคะแนนสอบที่ประกาศผลแล้ว ในปีการศึกษา ${term.year}`}
          hint="ระบบคะแนนส่งเฉพาะช่วงสอบที่ประกาศผลให้นักเรียนแล้ว — เมื่อประกาศแล้วกด ดึงคะแนนล่าสุด"
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            <Card>
              <CardHeader
                icon={<CalendarRange className="size-4.5" strokeWidth={1.8} />}
                title="ช่วงสอบที่นำมาคิด"
              />
              <div className="grid gap-2 px-4 pb-4 sm:px-5 sm:pb-5">
                {periods.map((p) => (
                  <label
                    key={p.key}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary/40"
                  >
                    <input
                      type="checkbox"
                      checked={!skipped.has(p.key)}
                      onChange={() => togglePeriod(p.key)}
                      className="size-4 accent-[var(--color-primary)]"
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader
                icon={<BookOpen className="size-4.5" strokeWidth={1.8} />}
                title={`วิชาที่นำมาคิด ${n(counted.size)} จาก ${n(groupSubjects.length)} วิชา`}
                action={
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setDropped((prev) => {
                          const next = new Set(prev);
                          groupSubjects.forEach((s) => next.delete(s.key));
                          return next;
                        })
                      }
                    >
                      เลือกทั้งหมด
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setDropped((prev) => new Set([...prev, ...groupSubjects.map((s) => s.key)]))
                      }
                    >
                      ไม่เลือกเลย
                    </Button>
                  </>
                }
              />
              <div className="flex flex-wrap gap-2 px-4 pb-4 sm:px-5 sm:pb-5">
                {groupSubjects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">ไม่มีวิชาที่มีคะแนนในกลุ่มนี้</p>
                ) : (
                  groupSubjects.map((s) => {
                    const on = !dropped.has(s.key);
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => toggleSubject(s.key)}
                        aria-pressed={on}
                        className={cn(
                          'rounded-lg border px-3 py-1.5 text-left text-xs transition-colors',
                          on
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border bg-card text-muted-foreground line-through hover:bg-secondary/40',
                        )}
                      >
                        <span className="font-medium">{s.name}</span>
                        <span className="ml-1.5 tabular-nums text-muted-foreground">{s.code}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </Card>
          </div>

          {gradeNow === 'all' ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="size-4 text-[#8a6a00]" strokeWidth={1.8} />
              กำลังจัดอันดับข้ามชั้น — ข้อสอบแต่ละชั้นไม่ใช่ชุดเดียวกัน ใช้ดูภาพรวมได้ แต่เทียบกันตรง ๆ ไม่ได้
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label="นักเรียนในกลุ่ม" value={n(group.length)} />
            <Tile label="มีคะแนน" value={n(withScore.length)} tone="primary" />
            <Tile label="เฉลี่ย" value={mean === null ? '–' : `${mean.toFixed(2)}%`} tone="navy" />
            <Tile
              label="สูงสุด"
              value={withScore.length ? `${pct(withScore[0].total.percent)}%` : '–'}
              tone="primary"
            />
          </div>

          <Card>
            <CardHeader
              icon={<Trophy className="size-4.5" strokeWidth={1.8} />}
              title={`อันดับ — ${scopeLabel ?? ''}${gradeNow && gradeNow !== 'all' ? ` ${gradeNow}` : ''}`}
              action={
                <div className="relative w-56">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    strokeWidth={1.8}
                  />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="ค้นหาชื่อ / รหัส / ห้อง"
                    className="h-9 pl-9"
                  />
                </div>
              }
            />
            {group.length === 0 ? (
              <p className="border-t border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
                ยังไม่มีนักเรียนในกลุ่มนี้
              </p>
            ) : (
              <div className="overflow-x-auto border-t border-border/60">
                <table className="w-full min-w-[44rem] text-sm">
                  <thead className="bg-secondary/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-center font-medium">อันดับ</th>
                      <th className="px-3 py-2 text-left font-medium">นักเรียน</th>
                      <th className="px-3 py-2 text-left font-medium">ห้อง</th>
                      {scope === 'grade' ? (
                        <th className="px-3 py-2 text-left font-medium">Track</th>
                      ) : null}
                      {shownPeriods.map((p) => (
                        <th key={p.key} className="px-3 py-2 text-right font-medium">
                          {p.semester}/{p.examType === 'midterm' ? 'กลางภาค' : 'ปลายภาค'} %
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right font-medium">นับ (วิชา)</th>
                      <th className="px-3 py-2 text-right font-medium">เฉลี่ยร้อยละ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {shown.map((s) => (
                      <tr key={s.id} className={cn('hover:bg-secondary/30', s.rank === null && 'opacity-60')}>
                        <td className="px-3 py-2 text-center">
                          {s.rank === null ? (
                            <span className="text-muted-foreground">–</span>
                          ) : (
                            <span
                              className={cn(
                                'inline-grid min-w-8 place-items-center rounded-full px-1.5 py-0.5 text-sm font-semibold tabular-nums',
                                s.rank <= 3 ? 'bg-primary/10 text-primary' : '',
                              )}
                            >
                              {s.rank}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <p>
                            {s.fullName}
                            {s.nickname ? (
                              <span className="text-muted-foreground"> ({s.nickname})</span>
                            ) : null}
                          </p>
                          <p className="text-xs tabular-nums text-muted-foreground">
                            {s.code}
                            {s.total.absent ? (
                              <span className="ml-2 text-destructive">ขาดสอบ {s.total.absent} วิชา</span>
                            ) : null}
                            {s.total.pending ? (
                              <span className="ml-2">ยังไม่มีคะแนน {s.total.pending} วิชา</span>
                            ) : null}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                          {s.gradeLevel}/{s.classroom}
                          {s.classNumber ? ` เลขที่ ${s.classNumber}` : ''}
                        </td>
                        {scope === 'grade' ? (
                          <td className="px-3 py-2">
                            {s.trackName ? (
                              <Badge tone="primary">{s.trackName}</Badge>
                            ) : (
                              <Badge tone="secondary">ยังไม่เลือก</Badge>
                            )}
                          </td>
                        ) : null}
                        {s.byPeriod.map((v, i) => (
                          <td key={shownPeriods[i].key} className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {pct(v)}
                          </td>
                        ))}
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {s.total.counted ? n(s.total.counted) : '–'}
                        </td>
                        <td className="px-3 py-2 text-right text-base font-semibold tabular-nums">
                          {pct(s.total.percent)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {shown.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">ไม่พบนักเรียนตามคำค้น</p>
                ) : null}
              </div>
            )}
          </Card>
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
  value: string;
  tone?: 'secondary' | 'primary' | 'navy';
}) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums',
          tone === 'primary' && 'text-primary',
          tone === 'navy' && 'text-navy',
        )}
      >
        {value}
      </p>
    </Card>
  );
}
