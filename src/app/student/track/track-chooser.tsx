'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  CalendarClock,
  CheckCircle2,
  GraduationCap,
  History,
  Info,
  Lock,
  Repeat,
  Route,
  Timer,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardHeader, EmptyState, Select } from '@/components/ui';
import { Modal, useDialog } from '@/components/dialog';
import { SubjectList } from '@/components/track-subjects';
import {
  changeLimitLabel,
  changeNote,
  countdownParts,
  countdownText,
  countdownUrgency,
  termLabel,
  trackPhaseLabel,
  trackWindow,
  type ChangeStanding,
  type CountdownUrgency,
  type Term,
  type TrackRow,
  type TrackWindow,
} from '@/lib/track-core';
import { cn, thaiDateTimeLongOf } from '@/lib/utils';
import { chooseTrack } from './actions';

export interface MyChoice {
  trackId: number;
  optionId: number | null;
  trackName: string;
  optionName: string | null;
  chosenAt: string;
  changedByAdmin: boolean;
  /** how many changes the held สาย still allows — null outside the open term */
  change: ChangeStanding | null;
  /** the held สาย's ปิดรับ — the deadline for changing, counted down on the card */
  changeClosesAt: string | null;
}

export interface HistoryRow {
  key: string;
  year: string;
  semester: number;
  trackName: string;
  optionName: string | null;
}

/**
 * The line under a สาย's name that says where it stands against the clock —
 * empty for one with no window at all, which needs no explanation. While the
 * window is live it counts down, so "ถึง 30 มิ.ย. 16:00" also reads as how
 * long that actually is.
 */
function windowNote(w: TrackWindow, at: Date): { text: string; urgency: CountdownUrgency | null } {
  if (w.state === 'before') {
    const ms = w.opensAt!.getTime() - at.getTime();
    return {
      text: `เปิดให้เลือก ${thaiDateTimeLongOf(w.opensAt)} น. — อีก ${countdownText(ms)}`,
      urgency: null,
    };
  }
  if (w.state === 'after')
    return {
      text: `หมดเวลาเลือกแล้ว — ปิดรับ ${thaiDateTimeLongOf(w.closesAt)} น.`,
      urgency: null,
    };
  if (!w.closesAt) return { text: '', urgency: null };
  const ms = w.closesAt.getTime() - at.getTime();
  return {
    text: `เลือกได้ถึง ${thaiDateTimeLongOf(w.closesAt)} น. — เหลืออีก ${countdownText(ms)}`,
    urgency: countdownUrgency(ms),
  };
}

const URGENCY_TEXT: Record<CountdownUrgency, string> = {
  calm: 'text-muted-foreground',
  soon: 'font-medium text-[var(--gold-text)]',
  urgent: 'font-medium text-destructive',
};

/**
 * The server's clock, kept ticking in the browser.
 *
 * It runs at the offset between the server's `now` and the device's clock
 * rather than on the device's clock itself: a phone set ten minutes fast would
 * otherwise show "หมดเวลา" while the server, which has the final say, is still
 * taking choices. Crossing any of `boundaries` (a เปิด or ปิดรับ) refreshes the
 * page, so the list re-renders from the server as the window actually moves.
 */
function useServerClock(serverNow: string, boundaries: number[]): Date {
  const router = useRouter();
  const [at, setAt] = useState(() => new Date(serverNow));
  const refresh = useRef(router.refresh);
  refresh.current = router.refresh;
  const key = boundaries.join(',');

  useEffect(() => {
    const offset = Date.parse(serverNow) - Date.now();
    const marks = key ? key.split(',').map(Number) : [];
    let last = Date.now() + offset;
    setAt(new Date(last));
    const timer = window.setInterval(() => {
      const t = Date.now() + offset;
      if (marks.some((m) => last < m && m <= t)) refresh.current();
      last = t;
      setAt(new Date(t));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [serverNow, key]);

  return at;
}

/**
 * นับถอยหลัง — the big box over the list, so the time left is the first thing
 * a นักเรียน reads rather than a date they have to subtract from today.
 */
function Countdown({
  label,
  target,
  at,
  hint,
}: {
  label: string;
  target: Date;
  at: Date;
  hint?: string;
}) {
  const ms = target.getTime() - at.getTime();
  const urgency = countdownUrgency(ms);
  const { days, hours, minutes, seconds } = countdownParts(ms);
  const cells: [number, string][] = [
    ...(days ? ([[days, 'วัน']] as [number, string][]) : []),
    [hours, 'ชั่วโมง'],
    [minutes, 'นาที'],
    [seconds, 'วินาที'],
  ];
  return (
    <Card
      role="timer"
      className={cn(
        'p-4 sm:p-5',
        urgency === 'urgent'
          ? 'border-destructive/40 bg-destructive/5'
          : urgency === 'soon'
            ? 'border-accent/60 bg-accent/10'
            : '',
      )}
    >
      <p
        className={cn(
          'flex items-center gap-1.5 text-sm',
          urgency === 'calm' ? 'font-medium' : URGENCY_TEXT[urgency],
        )}
      >
        <Timer className="size-4.5 shrink-0" strokeWidth={1.8} />
        {label}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {cells.map(([n, unit]) => (
          <div
            key={unit}
            className="min-w-16 rounded-xl border border-border bg-card px-3 py-2 text-center"
          >
            <p
              className={cn(
                'text-2xl font-semibold tabular-nums',
                urgency === 'urgent' ? 'text-destructive' : '',
              )}
            >
              {unit === 'วัน' ? n : String(n).padStart(2, '0')}
            </p>
            <p className="text-xs text-muted-foreground">{unit}</p>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-xs text-muted-foreground">
        ถึง {thaiDateTimeLongOf(target)} น.{hint ? ` — ${hint}` : ''}
      </p>
    </Card>
  );
}

export function TrackChooser({
  now,
  term,
  terms,
  openTerm,
  isOpenTerm,
  gradeLevel,
  tracks,
  choice,
  history,
}: {
  /** the server's clock at render — see the note where the page reads it */
  now: string;
  term: Term;
  terms: Term[];
  openTerm: Term;
  isOpenTerm: boolean;
  gradeLevel: string | null;
  tracks: TrackRow[];
  choice: MyChoice | null;
  history: HistoryRow[];
}) {
  const router = useRouter();
  const dialog = useDialog();
  const [trackId, setTrackId] = useState<number | null>(null);
  const [optionId, setOptionId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TrackRow | null>(null);
  const [saving, setSaving] = useState(false);
  /** the list reopened over an existing choice, to change it */
  const [changing, setChanging] = useState(false);

  const selected = tracks.find((t) => t.id === trackId) ?? null;
  const canChange = !!choice?.change && choice.change.blocked === null;
  const unchanged =
    !!choice && selected?.id === choice.trackId && (optionId ?? null) === choice.optionId;

  // Every instant at which something on this page changes state.
  const boundaries = [
    ...tracks.flatMap((t) => [t.opensAt, t.closesAt]),
    choice?.changeClosesAt ?? null,
  ]
    .filter((x): x is string => !!x)
    .map((x) => Date.parse(x))
    .sort((a, b) => a - b);
  const at = useServerClock(now, boundaries);

  // ช่วงเวลาเปิด-ปิด, once per tick for every สาย. A Track outside its window
  // is shown rather than hidden: "TrackSM เปิด 1 มิถุนายน" is the answer a
  // นักเรียน came to the page for, and an empty screen is not.
  const windows = new Map(tracks.map((t) => [t.id, trackWindow(t, at)]));
  const selectedOpen = selected ? windows.get(selected.id)?.state === 'open' : false;
  const anyOpen = tracks.some((t) => windows.get(t.id)?.state === 'open');

  // What the big นับถอยหลัง counts to: the soonest ปิดรับ among the สาย open
  // now, or — before any has opened — the soonest เปิด. Nothing when the open
  // ones have no ปิดรับ at all; "ไม่มีกำหนด" needs no clock.
  const openWindows = tracks.map((t) => windows.get(t.id)!).filter((w) => w.state === 'open');
  const closings = openWindows.map((w) => w.closesAt).filter((d): d is Date => !!d);
  const soonestClose = closings.length
    ? new Date(Math.min(...closings.map((d) => d.getTime())))
    : null;
  const sameClose =
    closings.length === openWindows.length &&
    closings.every((d) => d.getTime() === soonestClose?.getTime());
  const openings = tracks
    .map((t) => windows.get(t.id)!)
    .filter((w) => w.state === 'before' && w.opensAt)
    .map((w) => w.opensAt!.getTime());
  const soonestOpen =
    !openWindows.length && openings.length ? new Date(Math.min(...openings)) : null;
  const countdown = soonestClose ? (
    <Countdown
      label={sameClose ? 'เหลือเวลาเลือก Track' : 'Track แรกจะปิดรับในอีก'}
      target={soonestClose}
      at={at}
      hint={sameClose ? undefined : 'แต่ละ Track ปิดรับไม่พร้อมกัน ดูเวลาที่แต่ละ Track'}
    />
  ) : soonestOpen ? (
    <Countdown label="จะเปิดให้เลือก Track ในอีก" target={soonestOpen} at={at} />
  ) : null;
  const changeLeftMs = choice?.changeClosesAt
    ? Date.parse(choice.changeClosesAt) - at.getTime()
    : null;

  function gotoTerm(value: string) {
    const [yearId, semester] = value.split(':');
    router.push(`/student/track?year=${yearId}&semester=${semester}`);
  }

  function startChange() {
    if (!choice) return;
    setTrackId(choice.trackId);
    setOptionId(choice.optionId);
    setChanging(true);
  }

  async function submit() {
    if (saving || !selected || !selectedOpen || unchanged) return;
    if (selected.options.length && !optionId) {
      toast.error(`เลือกข้อย่อยของ “${selected.name}” ด้วย`);
      return;
    }
    // The last stop before the choice counts — said plainly, with the สาย, the
    // แขนง and how many changes will be left, because that is the sentence
    // they have to agree with.
    const option = optionId
      ? `ข้อย่อย: ${selected.options.find((o) => o.id === optionId)?.name} · `
      : '';
    const left = choice?.change ? choice.change.left - 1 : 0;
    const ok = await dialog.confirm(
      choice
        ? {
            title: `ยืนยันเปลี่ยนเป็น “${selected.name}”?`,
            description: `${option}${
              left > 0
                ? `หลังเปลี่ยนแล้ว คุณจะแก้ไขได้อีก ${left} ครั้ง`
                : 'นี่คือการแก้ไขครั้งสุดท้าย — หลังจากนี้เปลี่ยนเองไม่ได้อีก'
            }`,
          }
        : {
            title: `ยืนยันเลือก “${selected.name}”?`,
            description: `${option}${
              selected.changeLimit > 0
                ? `เลือกแล้วแก้ไขได้อีก ${selected.changeLimit} ครั้ง`
                : 'เลือกแล้วแก้ไขไม่ได้ — ต้องการเปลี่ยน ติดต่อฝ่ายวิชาการ'
            }`,
          },
    );
    if (!ok) return;

    setSaving(true);
    const r = await chooseTrack({
      yearId: term.yearId,
      semester: term.semester,
      trackId: selected.id,
      optionId: selected.options.length ? optionId : null,
    });
    setSaving(false);
    if (r.ok) {
      toast.success(r.message);
      setChanging(false);
      setTrackId(null);
      setOptionId(null);
      router.refresh();
    } else {
      toast.error(r.message);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
        <span className="text-sm font-medium">ภาคเรียน</span>
        <Select
          value={`${term.yearId}:${term.semester}`}
          onChange={(e) => gotoTerm(e.target.value)}
          className="h-10 w-64"
        >
          {terms.map((t) => (
            <option key={`${t.yearId}:${t.semester}`} value={`${t.yearId}:${t.semester}`}>
              {termLabel(t)}
              {t.yearId === openTerm.yearId && t.semester === openTerm.semester
                ? ' (เปิดให้เลือก)'
                : ''}
            </option>
          ))}
        </Select>
        {gradeLevel ? <Badge tone="navy">{gradeLevel}</Badge> : null}
      </Card>

      {choice ? (
        <Card className="p-5">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-success/10 text-success">
              <CheckCircle2 className="size-5.5" strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{termLabel(term)}</p>
              <h2 className="mt-0.5 text-lg font-semibold">{choice.trackName}</h2>
              {choice.optionName ? (
                <Badge tone="primary" className="mt-1.5">
                  {choice.optionName}
                </Badge>
              ) : null}
              {choice.change ? (
                <p
                  className={cn(
                    'mt-3 flex items-center gap-1.5 text-sm',
                    canChange ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {canChange ? (
                    <Repeat className="size-4 shrink-0" strokeWidth={1.8} />
                  ) : (
                    <Lock className="size-4 shrink-0" strokeWidth={1.8} />
                  )}
                  {changeNote(choice.change)}
                </p>
              ) : (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock className="size-3.5" strokeWidth={1.8} />
                  เลือกแล้ว
                </p>
              )}
              {canChange && changeLeftMs !== null ? (
                <p
                  className={cn(
                    'mt-1 flex items-center gap-1.5 text-xs',
                    URGENCY_TEXT[countdownUrgency(changeLeftMs)],
                  )}
                >
                  <Timer className="size-3.5 shrink-0" strokeWidth={1.8} />
                  แก้ไขได้ถึง {thaiDateTimeLongOf(new Date(choice.changeClosesAt!))} น. — เหลืออีก{' '}
                  {countdownText(changeLeftMs)}
                </p>
              ) : null}
              {choice.changedByAdmin ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  รายการนี้ถูกปรับโดยฝ่ายวิชาการ
                </p>
              ) : null}
            </div>
            {canChange && !changing ? (
              <Button variant="outline" size="sm" onClick={startChange} className="shrink-0">
                <Repeat className="size-4" strokeWidth={1.8} />
                เปลี่ยน Track
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {choice && !changing ? null : !isOpenTerm ? (
        <EmptyState
          icon={<History className="size-8" strokeWidth={1.5} />}
          title={`ไม่ได้เลือก Track ใน${termLabel(term)}`}
          hint={`เลือกได้เฉพาะ${termLabel(openTerm)} ซึ่งเป็นภาคเรียนที่เปิดอยู่`}
        />
      ) : tracks.length === 0 ? (
        <EmptyState
          icon={<Route className="size-8" strokeWidth={1.5} />}
          title="ยังไม่มี Track ให้เลือก"
          hint={
            gradeLevel
              ? `ยังไม่มี Track ที่เปิดให้ ${gradeLevel} ใน${termLabel(term)} — รอผู้ดูแลเปิดให้เลือก`
              : 'รอผู้ดูแลเปิดให้เลือก'
          }
        />
      ) : (
        <>
          {countdown}
          <Card>
            <CardHeader
              icon={<Route className="size-4.5" strokeWidth={1.8} />}
              title={changing ? 'เปลี่ยน Track' : `เลือก Track ของ${termLabel(term)}`}
            />
            <ul className="space-y-2.5 px-4 pb-4 sm:px-5">
              {tracks.map((t) => {
                const w = windows.get(t.id)!;
                const shut = w.state !== 'open';
                const note = windowNote(w, at);
                const on = t.id === trackId;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      disabled={shut}
                      onClick={() => {
                        setTrackId(t.id);
                        if (t.id !== trackId) setOptionId(null);
                      }}
                      className={cn(
                        'w-full rounded-xl border px-4 py-3.5 text-left transition-colors',
                        shut
                          ? 'cursor-not-allowed border-border bg-secondary/30 opacity-70'
                          : on
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:bg-secondary/50',
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{t.name}</span>
                        <Badge tone="navy">{trackPhaseLabel(t.phase)}</Badge>
                        {t.subjects.length ? (
                          <Badge tone="secondary">{t.subjects.length} วิชา</Badge>
                        ) : null}
                        {t.options.length ? (
                          <Badge tone="secondary">มีข้อย่อย {t.options.length} รายการ</Badge>
                        ) : null}
                        {choice?.trackId === t.id ? <Badge tone="primary">ที่เลือกไว้</Badge> : null}
                      </div>
                      {t.description ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
                      ) : null}
                      {note.text ? (
                        <p
                          className={cn(
                            'mt-1.5 flex items-center gap-1.5 text-xs',
                            URGENCY_TEXT[note.urgency ?? 'calm'],
                          )}
                        >
                          <CalendarClock className="size-3.5 shrink-0" strokeWidth={1.8} />
                          {note.text}
                        </p>
                      ) : null}
                      {/* Changing spends the held สาย's allowance, not this one's —
                          so the line is only worth reading before a first choice. */}
                      {!choice ? (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Repeat className="size-3.5 shrink-0" strokeWidth={1.8} />
                          {changeLimitLabel(t.changeLimit)}
                        </p>
                      ) : null}
                    </button>

                    <div className="mt-1.5 pl-1">
                      <button
                        type="button"
                        onClick={() => setDetail(t)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                      >
                        <Info className="size-3.5" strokeWidth={1.8} />
                        ดูรายละเอียด — เรียนอะไรบ้าง
                      </button>
                    </div>

                    {on && !shut && t.options.length ? (
                      <ul className="mt-2 space-y-2 pl-4">
                        {t.options.map((o) => {
                          const picked = o.id === optionId;
                          return (
                            <li key={o.id}>
                              <button
                                type="button"
                                onClick={() => setOptionId(o.id)}
                                className={cn(
                                  'w-full rounded-lg border px-3.5 py-2.5 text-left text-sm transition-colors',
                                  picked
                                    ? 'border-primary bg-primary/5 font-medium'
                                    : 'border-border hover:bg-secondary/50',
                                )}
                              >
                                {o.name}
                                {o.description ? (
                                  <span className="block text-xs font-normal text-muted-foreground">
                                    {o.description}
                                  </span>
                                ) : null}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3.5 sm:px-5">
              <p className="text-xs text-muted-foreground">
                {!anyOpen
                  ? 'ยังไม่ถึงเวลาเลือก หรือหมดเวลาแล้ว — ดูวันเวลาที่แต่ละ Track'
                  : choice?.change
                    ? `ตรวจสอบให้แน่ใจก่อนกดยืนยัน — ${changeNote(choice.change)}`
                    : selected
                      ? `ตรวจสอบให้แน่ใจก่อนกดยืนยัน — ${changeLimitLabel(selected.changeLimit)}`
                      : 'ตรวจสอบให้แน่ใจก่อนกดยืนยัน'}
              </p>
              <div className="flex items-center gap-2">
                {changing ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setChanging(false);
                      setTrackId(null);
                      setOptionId(null);
                    }}
                    disabled={saving}
                  >
                    ยกเลิก
                  </Button>
                ) : null}
                <Button onClick={submit} disabled={saving || !selected || !selectedOpen || unchanged}>
                  {changing ? 'ยืนยันการเปลี่ยน' : 'ยืนยันการเลือก'}
                </Button>
              </div>
            </div>
          </Card>
        </>
      )}

      {detail ? <TrackDetail track={detail} onClose={() => setDetail(null)} /> : null}

      {history.length ? (
        <Card>
          <CardHeader
            icon={<History className="size-4.5" strokeWidth={1.8} />}
            title="ประวัติการเลือก Track"
          />
          <ul className="divide-y divide-border/60">
            {history.map((h) => (
              <li key={h.key} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <span className="w-44 shrink-0 text-xs text-muted-foreground">
                  ปีการศึกษา {h.year} ภาคเรียนที่ {h.semester}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{h.trackName}</span>
                {h.optionName ? <Badge tone="navy">{h.optionName}</Badge> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

/**
 * หน้ารายละเอียดของสายหนึ่ง — what a นักเรียน gets by choosing it.
 *
 * Read-only on purpose: it answers "เลือกแล้วจะได้เรียนอะไร และเหมาะกับคณะไหน"
 * and hands the decision back to the list, so a student cannot confirm from
 * inside a panel they opened only to look.
 */
function TrackDetail({ track, onClose }: { track: TrackRow; onClose: () => void }) {
  return (
    <Modal
      onClose={onClose}
      labelledBy="track-detail-title"
      footer={
        <Button variant="outline" onClick={onClose}>
          ปิด
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="track-detail-title" className="text-base font-semibold">
          {track.name}
        </h2>
        <Badge tone="navy">
          ภาคเรียนที่ {track.semester} · {trackPhaseLabel(track.phase)}
        </Badge>
        {track.groupCode ? <Badge tone="secondary">กลุ่ม {track.groupCode}</Badge> : null}
      </div>
      {track.description ? (
        <p className="mt-1.5 text-sm text-muted-foreground">{track.description}</p>
      ) : null}

      <div className="mt-4 space-y-4">
        <section>
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <BookOpen className="size-4" strokeWidth={1.8} />
            วิชาที่จะได้เรียน
          </p>
          <div className="mt-2">
            <SubjectList
              subjects={track.subjects}
              empty="ยังไม่ได้ระบุวิชาของสายนี้ — สอบถามผู้ดูแลระบบ"
            />
          </div>
        </section>

        {track.options.length ? (
          <section>
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Route className="size-4" strokeWidth={1.8} />
              ข้อย่อยที่เลือกได้ — เลือกได้หนึ่งข้อ
            </p>
            <ul className="mt-2 space-y-2.5">
              {track.options.map((o) => (
                <li key={o.id} className="rounded-xl border border-border p-3">
                  <p className="text-sm font-medium">{o.name}</p>
                  {o.description ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{o.description}</p>
                  ) : null}
                  {o.groupId ? (
                    <div className="mt-2">
                      <SubjectList subjects={o.subjects} empty="ยังไม่ได้ระบุวิชาของข้อย่อยนี้" />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {track.admissionNote ? (
          <section className="rounded-xl bg-secondary/50 p-3.5">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <GraduationCap className="size-4" strokeWidth={1.8} />
              เรียนแล้วเหมาะกับคณะ/มหาวิทยาลัยอะไร
            </p>
            <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
              {track.admissionNote}
            </p>
          </section>
        ) : null}
      </div>
    </Modal>
  );
}
