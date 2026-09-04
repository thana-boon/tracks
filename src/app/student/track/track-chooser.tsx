'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  CalendarClock,
  CheckCircle2,
  GraduationCap,
  History,
  Info,
  Lock,
  Route,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardHeader, EmptyState, Select } from '@/components/ui';
import { Modal, useDialog } from '@/components/dialog';
import { SubjectList } from '@/components/track-subjects';
import {
  termLabel,
  trackPhaseLabel,
  trackWindow,
  type Term,
  type TrackRow,
  type TrackWindow,
} from '@/lib/track-core';
import { cn, thaiDateTimeLongOf } from '@/lib/utils';
import { chooseTrack } from './actions';

export interface MyChoice {
  trackName: string;
  optionName: string | null;
  chosenAt: string;
  changedByAdmin: boolean;
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
 * empty for one with no window at all, which needs no explanation.
 */
function windowNote(w: TrackWindow): string {
  if (w.state === 'before') return `เปิดให้เลือก ${thaiDateTimeLongOf(w.opensAt)} น.`;
  if (w.state === 'after') return `หมดเวลาเลือกแล้ว — ปิดรับ ${thaiDateTimeLongOf(w.closesAt)} น.`;
  return w.closesAt ? `เลือกได้ถึง ${thaiDateTimeLongOf(w.closesAt)} น.` : '';
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

  const selected = tracks.find((t) => t.id === trackId) ?? null;

  // ช่วงเวลาเปิด-ปิด, once per render for every สาย. A Track outside its window
  // is shown rather than hidden: "TrackSM เปิด 1 มิถุนายน" is the answer a
  // นักเรียน came to the page for, and an empty screen is not.
  const at = new Date(now);
  const windows = new Map(tracks.map((t) => [t.id, trackWindow(t, at)]));
  const selectedOpen = selected ? windows.get(selected.id)?.state === 'open' : false;
  const anyOpen = tracks.some((t) => windows.get(t.id)?.state === 'open');

  function gotoTerm(value: string) {
    const [yearId, semester] = value.split(':');
    router.push(`/student/track?year=${yearId}&semester=${semester}`);
  }

  async function submit() {
    if (saving || !selected || !selectedOpen) return;
    if (selected.options.length && !optionId) {
      toast.error(`เลือกข้อย่อยของ “${selected.name}” ด้วย`);
      return;
    }
    // The last stop before a choice that only an admin can undo — said plainly,
    // with the สาย and แขนง in it, because that is the sentence they have to
    // agree with.
    const ok = await dialog.confirm({
      title: `ยืนยันเลือก “${selected.name}”?`,
      description: `${
        optionId
          ? `ข้อย่อย: ${selected.options.find((o) => o.id === optionId)?.name} · `
          : ''
      }เลือกแล้วเปลี่ยนเองไม่ได้ ต้องติดต่อผู้ดูแลระบบ`,
    });
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
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="size-3.5" strokeWidth={1.8} />
                เลือกแล้ว — ต้องการเปลี่ยน ติดต่อผู้ดูแลระบบ
              </p>
              {choice.changedByAdmin ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  รายการนี้ถูกปรับโดยผู้ดูแลระบบ
                </p>
              ) : null}
            </div>
          </div>
        </Card>
      ) : !isOpenTerm ? (
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
        <Card>
          <CardHeader
            icon={<Route className="size-4.5" strokeWidth={1.8} />}
            title={`เลือก Track ของ${termLabel(term)}`}
          />
          <ul className="space-y-2.5 px-4 pb-4 sm:px-5">
            {tracks.map((t) => {
              const w = windows.get(t.id)!;
              const shut = w.state !== 'open';
              const note = windowNote(w);
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
                    </div>
                    {t.description ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
                    ) : null}
                    {note ? (
                      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarClock className="size-3.5 shrink-0" strokeWidth={1.8} />
                        {note}
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
              {anyOpen
                ? 'ตรวจสอบให้แน่ใจก่อนกดยืนยัน — เลือกได้ครั้งเดียว'
                : 'ยังไม่ถึงเวลาเลือก หรือหมดเวลาแล้ว — ดูวันเวลาที่แต่ละ Track'}
            </p>
            <Button onClick={submit} disabled={saving || !selected || !selectedOpen}>
              ยืนยันการเลือก
            </Button>
          </div>
        </Card>
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
