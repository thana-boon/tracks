'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChartPie, Route, Search, Users, Eraser, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Label,
  Select,
} from '@/components/ui';
import { Modal, useDialog } from '@/components/dialog';
import { SEMESTERS, trackAllows, type Term, type TrackRow } from '@/lib/track-core';
import { cn } from '@/lib/utils';
import { clearStudentChoice, setStudentChoice } from '../actions';

export interface ChoiceStudent {
  id: number;
  code: string;
  fullName: string;
  nickname: string | null;
  gradeLevel: string | null;
  classroom: string | null;
  classNumber: number | null;
  trackId: number | null;
  optionId: number | null;
  byAdmin: boolean;
}

type StatusFilter = 'all' | 'chosen' | 'pending';

export function ChoicesManager({
  term,
  years,
  tracks,
  students,
}: {
  term: Term;
  years: { id: number; year: string }[];
  tracks: TrackRow[];
  students: ChoiceStudent[];
}) {
  const router = useRouter();
  const dialog = useDialog();
  const [q, setQ] = useState('');
  const [grade, setGrade] = useState('all');
  const [room, setRoom] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [editing, setEditing] = useState<ChoiceStudent | null>(null);

  const trackById = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);

  function goto(yearId: number, semester: number) {
    router.push(`/admin/tracks/students?year=${yearId}&semester=${semester}`);
  }

  const grades = useMemo(
    () => [...new Set(students.map((s) => s.gradeLevel).filter(Boolean) as string[])].sort(),
    [students],
  );
  const rooms = useMemo(
    () =>
      [
        ...new Set(
          students
            .filter((s) => grade === 'all' || s.gradeLevel === grade)
            .map((s) => s.classroom)
            .filter(Boolean) as string[],
        ),
      ].sort((a, b) => a.localeCompare(b, 'th', { numeric: true })),
    [students, grade],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return students.filter((s) => {
      if (grade !== 'all' && s.gradeLevel !== grade) return false;
      if (room !== 'all' && s.classroom !== room) return false;
      if (status === 'chosen' && !s.trackId) return false;
      if (status === 'pending' && s.trackId) return false;
      if (!needle) return true;
      return (
        s.fullName.toLowerCase().includes(needle) ||
        s.code.toLowerCase().includes(needle) ||
        (s.nickname ?? '').toLowerCase().includes(needle)
      );
    });
  }, [students, q, grade, room, status]);

  const chosen = students.filter((s) => s.trackId).length;

  async function clear(s: ChoiceStudent) {
    const ok = await dialog.confirm({
      title: `ล้าง Track ของ ${s.fullName}?`,
      description: 'นักเรียนจะกลับไปเลือกเองได้อีกครั้งในภาคเรียนนี้',
      tone: 'destructive',
    });
    if (!ok) return;
    const r = await clearStudentChoice(s.id, term.yearId, term.semester);
    r.ok ? toast.success(r.message) : toast.error(r.message);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">การเลือก Track ของนักเรียน</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            นักเรียนเลือกเองได้ครั้งเดียวต่อภาคเรียน — การเปลี่ยนหลังจากนั้นทำได้ที่หน้านี้เท่านั้น
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/tracks/report?year=${term.yearId}&semester=${term.semester}`}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-secondary/60"
          >
            <ChartPie className="size-4.5" strokeWidth={1.8} />
            รายงานสรุป
          </Link>
          <Link
            href={`/admin/tracks?year=${term.yearId}&semester=${term.semester}`}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-secondary/60"
          >
            <Route className="size-4.5" strokeWidth={1.8} />
            จัดการ Track
          </Link>
        </div>
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
        <Badge tone="primary">เลือกแล้ว {chosen.toLocaleString('th-TH')} คน</Badge>
        <Badge tone="secondary">
          ยังไม่เลือก {(students.length - chosen).toLocaleString('th-TH')} คน
        </Badge>
      </Card>

      {tracks.length === 0 ? (
        <EmptyState
          icon={<Route className="size-8" strokeWidth={1.5} />}
          title={`ยังไม่มี Track ในปีการศึกษา ${term.year} ภาคเรียนที่ ${term.semester}`}
          hint="สร้าง Track ของภาคเรียนนี้ก่อน จึงจะลงให้นักเรียนได้"
        />
      ) : (
        <Card>
          <CardHeader
            icon={<Users className="size-4.5" strokeWidth={1.8} />}
            title={`นักเรียน ${shown.length.toLocaleString('th-TH')} คน`}
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
            <Select
              value={grade}
              onChange={(e) => {
                setGrade(e.target.value);
                setRoom('all');
              }}
              className="h-10 w-28"
            >
              <option value="all">ทุกชั้น</option>
              {grades.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
            <Select value={room} onChange={(e) => setRoom(e.target.value)} className="h-10 w-28">
              <option value="all">ทุกห้อง</option>
              {rooms.map((r) => (
                <option key={r} value={r}>
                  ห้อง {r}
                </option>
              ))}
            </Select>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className="h-10 w-36"
            >
              <option value="all">ทั้งหมด</option>
              <option value="chosen">เลือกแล้ว</option>
              <option value="pending">ยังไม่เลือก</option>
            </Select>
          </div>

          {shown.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              ไม่พบนักเรียนตามเงื่อนไข
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {shown.map((s) => {
                const track = s.trackId ? trackById.get(s.trackId) : null;
                const option = track?.options.find((o) => o.id === s.optionId) ?? null;
                return (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {s.code}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        {s.fullName}
                        {s.nickname ? (
                          <span className="text-muted-foreground"> ({s.nickname})</span>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.gradeLevel}/{s.classroom}
                      </p>
                    </div>
                    <div className="hidden min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:flex">
                      {track ? (
                        <>
                          <Badge tone="primary">{track.name}</Badge>
                          {option ? <Badge tone="navy">{option.name}</Badge> : null}
                          {s.byAdmin ? <Badge tone="accent">ผู้ดูแลกำหนด</Badge> : null}
                        </>
                      ) : (
                        <Badge tone="secondary">ยังไม่เลือก</Badge>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => setEditing(s)}
                        title={track ? 'เปลี่ยน Track' : 'ลงให้'}
                        className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                      >
                        <Pencil className="size-4.5" strokeWidth={1.8} />
                      </button>
                      <button
                        onClick={() => clear(s)}
                        disabled={!track}
                        title="ล้างการเลือก"
                        className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
                      >
                        <Eraser className="size-4.5" strokeWidth={1.8} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {editing ? (
        <AssignForm
          term={term}
          tracks={tracks}
          student={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function AssignForm({
  term,
  tracks,
  student,
  onClose,
}: {
  term: Term;
  tracks: TrackRow[];
  student: ChoiceStudent;
  onClose: () => void;
}) {
  const [trackId, setTrackId] = useState<number | null>(student.trackId);
  const [optionId, setOptionId] = useState<number | null>(student.optionId);
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);

  const eligible = tracks.filter(
    (t) => showAll || (t.active && trackAllows(t, student.gradeLevel)),
  );
  const selected = tracks.find((t) => t.id === trackId) ?? null;

  async function submit() {
    if (saving) return;
    if (!trackId) {
      toast.error('เลือก Track ก่อน');
      return;
    }
    setSaving(true);
    const r = await setStudentChoice({
      studentId: student.id,
      yearId: term.yearId,
      semester: term.semester,
      trackId,
      optionId: selected?.options.length ? optionId : null,
    });
    setSaving(false);
    if (r.ok) {
      toast.success(r.message);
      onClose();
    } else {
      toast.error(r.message);
    }
  }

  return (
    <Modal
      onClose={onClose}
      labelledBy="assign-title"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button onClick={submit} disabled={saving}>
            บันทึก
          </Button>
        </>
      }
    >
      <h2 id="assign-title" className="text-base font-semibold">
        Track ของ {student.fullName}
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {student.gradeLevel}/{student.classroom} · ปีการศึกษา {term.year} ภาคเรียนที่{' '}
        {term.semester}
      </p>

      <div className="mt-4 space-y-3.5">
        <div>
          <Label>เลือก Track</Label>
          {eligible.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              ไม่มี Track ที่เปิดให้ {student.gradeLevel} ในภาคเรียนนี้
            </p>
          ) : (
            <ul className="space-y-2">
              {eligible.map((t) => {
                const on = t.id === trackId;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setTrackId(t.id);
                        if (t.id !== trackId) setOptionId(null);
                      }}
                      className={cn(
                        'w-full rounded-xl border px-3.5 py-3 text-left transition-colors',
                        on ? 'border-primary bg-primary/5' : 'border-border hover:bg-secondary/50',
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{t.name}</span>
                        {!t.active ? <Badge tone="secondary">ปิดไม่ให้เลือก</Badge> : null}
                        {!trackAllows(t, student.gradeLevel) ? (
                          <Badge tone="destructive">นอกระดับชั้น</Badge>
                        ) : null}
                      </div>
                      {t.description ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="mt-2 text-xs font-medium text-primary hover:underline"
          >
            {showAll ? 'แสดงเฉพาะที่เปิดให้ระดับชั้นนี้' : 'แสดง Track ทั้งหมดของภาคเรียนนี้'}
          </button>
        </div>

        {selected?.options.length ? (
          <div>
            <Label htmlFor="a-option">ข้อย่อยของ “{selected.name}”</Label>
            <Select
              id="a-option"
              value={optionId ?? ''}
              onChange={(e) => setOptionId(Number(e.target.value) || null)}
            >
              <option value="">— เลือกข้อย่อย —</option>
              {selected.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
