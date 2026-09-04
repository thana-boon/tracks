'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Route, Power, Users, X, Layers } from 'lucide-react';
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
  Textarea,
} from '@/components/ui';
import { Modal, useDialog } from '@/components/dialog';
import { SubjectList } from '@/components/track-subjects';
import {
  GRADE_LEVELS,
  SEMESTERS,
  subjectInTrack,
  trackPhaseLabel,
  trackWindow,
  type GroupCatalogRow,
  type Term,
  type TrackRow,
} from '@/lib/track-core';
import { PHASES } from '@/lib/subject-phase';
import { cn, fromSchoolDateTimeInput, thaiDateTimeLongOf, toSchoolDateTimeInput } from '@/lib/utils';
import { deleteTrack, saveTrack, toggleTrack } from './actions';

/** A Track as the list shows it — the row plus how many have picked it. */
export interface ManagerTrack extends TrackRow {
  chosenCount: number;
}

/**
 * The one-line reading of a Track's ช่วงเวลา, for the list.
 *
 * Rendered from the row rather than stored: the state is a fact about the
 * clock, and a badge that had been saved at create time would go on saying
 * "ยังไม่เปิด" a month after it opened.
 */
function windowBadge(t: ManagerTrack): { tone: 'secondary' | 'primary' | 'navy'; text: string } | null {
  if (!t.opensAt && !t.closesAt) return null;
  const w = trackWindow(t);
  const opens = thaiDateTimeLongOf(w.opensAt);
  const closes = thaiDateTimeLongOf(w.closesAt);
  if (w.state === 'before') return { tone: 'secondary', text: `เปิดให้เลือก ${opens} น.` };
  if (w.state === 'after') return { tone: 'secondary', text: `ปิดรับแล้ว ${closes} น.` };
  return {
    tone: 'primary',
    text: closes ? `เปิดถึง ${closes} น.` : `เปิดตั้งแต่ ${opens} น.`,
  };
}

/**
 * What the two boxes currently say, in a sentence — including the two blank
 * ones, because "ไม่กำหนดเวลา" is a real setting an admin can arrive at by
 * clearing a field and needs to see confirmed before they save.
 */
function windowHint(opensAt: string, closesAt: string): string {
  const opens = thaiDateTimeLongOf(fromSchoolDateTimeInput(opensAt));
  const closes = thaiDateTimeLongOf(fromSchoolDateTimeInput(closesAt));
  if (opensAt && !opens) return 'เวลาเปิดให้เลือกไม่ถูกต้อง';
  if (closesAt && !closes) return 'เวลาปิดรับไม่ถูกต้อง';
  if (!opens && !closes) return 'เว้นว่างทั้งคู่ = เปิดให้เลือกตลอด จนกว่าจะกดปิดไม่ให้เลือก';
  if (opens && closes)
    return fromSchoolDateTimeInput(closesAt)! <= fromSchoolDateTimeInput(opensAt)!
      ? 'เวลาปิดรับต้องอยู่หลังเวลาเปิดให้เลือก'
      : `นักเรียนเลือกได้ ${opens} น. ถึง ${closes} น.`;
  return opens
    ? `นักเรียนเลือกได้ตั้งแต่ ${opens} น. เป็นต้นไป`
    : `นักเรียนเลือกได้จนถึง ${closes} น.`;
}

export interface YearOption {
  id: number;
  year: string;
}

export function TracksManager({
  term,
  years,
  groups,
  tracks,
}: {
  term: Term;
  years: YearOption[];
  /** กลุ่มวิชาที่สร้างไว้แล้ว — ชื่อ Track และวิชาของมันมาจากที่นี่ */
  groups: GroupCatalogRow[];
  tracks: ManagerTrack[];
}) {
  const router = useRouter();
  const dialog = useDialog();
  const [editing, setEditing] = useState<ManagerTrack | null>(null);
  const [creating, setCreating] = useState(false);

  function goto(yearId: number, semester: number) {
    router.push(`/admin/tracks?year=${yearId}&semester=${semester}`);
  }

  async function remove(t: ManagerTrack) {
    const ok = await dialog.confirm({
      title: `ลบ “${t.name}”?`,
      description: 'ลบได้เฉพาะ Track ที่ยังไม่มีนักเรียนเลือก — ถ้ามีแล้วให้ปิดไม่ให้เลือกแทน',
      tone: 'destructive',
    });
    if (!ok) return;
    const r = await deleteTrack(t.id);
    r.ok ? toast.success(r.message) : toast.error(r.message);
  }

  async function toggle(t: ManagerTrack) {
    const r = await toggleTrack(t.id, !t.active);
    r.ok ? toast.success(r.message) : toast.error(r.message);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Track</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            สายการเรียนที่นักเรียนเลือกเองได้ภาคเรียนละหนึ่งครั้ง — บาง Track มีข้อย่อยให้เลือกต่อ
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/tracks/students?year=${term.yearId}&semester=${term.semester}`}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-secondary/60"
          >
            <Users className="size-4.5" strokeWidth={1.8} />
            การเลือกของนักเรียน
          </Link>
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4.5" strokeWidth={1.8} />
            สร้าง Track
          </Button>
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
        <p className="text-xs text-muted-foreground">
          หน้าเลือกของนักเรียนจะเปิดที่ภาคเรียนล่าสุดที่มี Track อยู่
        </p>
      </Card>

      {tracks.length === 0 ? (
        <EmptyState
          icon={<Route className="size-8" strokeWidth={1.5} />}
          title={`ยังไม่มี Track ในปีการศึกษา ${term.year} ภาคเรียนที่ ${term.semester}`}
          hint="สร้าง Track แรกของภาคเรียนนี้ แล้วนักเรียนจึงจะเห็นตัวเลือกในหน้าของตัวเอง"
        />
      ) : (
        <Card>
          <CardHeader
            icon={<Route className="size-4.5" strokeWidth={1.8} />}
            title={`ปีการศึกษา ${term.year} ภาคเรียนที่ ${term.semester} — ${tracks.length} Track`}
          />
          <ul className="divide-y divide-border/60">
            {tracks.map((t) => (
              <li key={t.id} className="flex items-start gap-4 px-4 py-3.5 sm:px-5">
                <span className="mt-0.5 grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Route className="size-5" strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{t.name}</p>
                    {!t.active ? <Badge tone="secondary">ปิดไม่ให้เลือก</Badge> : null}
                    {t.groupCode ? (
                      <Badge tone="secondary">
                        กลุ่ม {t.groupCode} · {trackPhaseLabel(t.phase)}
                      </Badge>
                    ) : (
                      <Badge tone="secondary">ยังไม่ผูกกลุ่มวิชา</Badge>
                    )}
                    <Badge tone="navy">
                      {t.gradeLevels.length ? t.gradeLevels.join(' · ') : 'ทุกระดับชั้น'}
                    </Badge>
                    <Badge tone="primary">เลือกแล้ว {t.chosenCount} คน</Badge>
                    {(() => {
                      const w = windowBadge(t);
                      return w ? <Badge tone={w.tone}>{w.text}</Badge> : null;
                    })()}
                  </div>
                  {t.description ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.groupId
                      ? t.subjects.length
                        ? `วิชาที่จะได้เรียน ${t.subjects.length} วิชา — ${t.subjects
                            .map((x) => x.name)
                            .join(', ')}`
                        : `กลุ่ม ${t.groupName} ยังไม่มีวิชาในภาคเรียนที่ ${t.semester} ${trackPhaseLabel(t.phase)}`
                      : 'แก้ไขเพื่อผูกกลุ่มวิชา แล้วนักเรียนจึงจะเห็นรายละเอียดวิชา'}
                  </p>
                  {t.options.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {t.options.map((o) => (
                        <span
                          key={o.id}
                          className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground"
                        >
                          {o.name}
                          {o.groupName ? ` · ${o.subjects.length} วิชา` : ''}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">ไม่มีข้อย่อย</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => toggle(t)}
                    title={t.active ? 'ปิดไม่ให้เลือก' : 'เปิดให้เลือก'}
                    className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  >
                    <Power className="size-4.5" strokeWidth={1.8} />
                  </button>
                  <button
                    onClick={() => setEditing(t)}
                    title="แก้ไข"
                    className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  >
                    <Pencil className="size-4.5" strokeWidth={1.8} />
                  </button>
                  <button
                    onClick={() => remove(t)}
                    title="ลบ"
                    className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4.5" strokeWidth={1.8} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {creating ? (
        <TrackForm
          term={term}
          years={years}
          groups={groups}
          onClose={() => setCreating(false)}
        />
      ) : null}
      {editing ? (
        <TrackForm
          term={term}
          years={years}
          groups={groups}
          track={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

/** An option row being edited — `id` null until it has been saved once. */
interface DraftOption {
  key: string;
  id: number | null;
  groupId: number | null;
  name: string;
  description: string;
}

function TrackForm({
  term,
  years,
  groups,
  track,
  onClose,
}: {
  term: Term;
  years: YearOption[];
  groups: GroupCatalogRow[];
  track?: ManagerTrack;
  onClose: () => void;
}) {
  const [yearId, setYearId] = useState(track?.yearId ?? term.yearId);
  const [semester, setSemester] = useState(track?.semester ?? term.semester);
  const [groupId, setGroupId] = useState<number | null>(track?.groupId ?? null);
  const [phase, setPhase] = useState<number | null>(track?.phase ?? null);
  const [name, setName] = useState(track?.name ?? '');
  const [description, setDescription] = useState(track?.description ?? '');
  const [admissionNote, setAdmissionNote] = useState(track?.admissionNote ?? '');
  const [grades, setGrades] = useState<string[]>(track?.gradeLevels ?? []);
  const [opensAt, setOpensAt] = useState(
    toSchoolDateTimeInput(track?.opensAt ? new Date(track.opensAt) : null),
  );
  const [closesAt, setClosesAt] = useState(
    toSchoolDateTimeInput(track?.closesAt ? new Date(track.closesAt) : null),
  );
  const [options, setOptions] = useState<DraftOption[]>(
    (track?.options ?? []).map((o) => ({
      key: `o${o.id}`,
      id: o.id,
      groupId: o.groupId,
      name: o.name,
      description: o.description ?? '',
    })),
  );
  const [saving, setSaving] = useState(false);

  const group = groups.find((g) => g.id === groupId) ?? null;

  /** วิชาของกลุ่มหนึ่งที่ตรงกับภาคเรียนและช่วงที่กำลังตั้ง — the live preview. */
  function preview(id: number | null) {
    if (!id) return [];
    const g = groups.find((x) => x.id === id);
    return (g?.subjects ?? []).filter((sub) => subjectInTrack({ semester, phase }, sub));
  }

  /**
   * Picking a กลุ่มวิชา fills the name in — that is what "ดึงชื่อมาจากกลุ่มวิชา"
   * means. It only overwrites a name the admin has not made their own: two สาย
   * of one ภาคเรียน may come from the same กลุ่ม in different ช่วง, and the
   * second one is told apart by a name typed over the top of this one.
   */
  function pickGroup(id: number | null) {
    const next = groups.find((g) => g.id === id) ?? null;
    const untouched = !name.trim() || groups.some((g) => g.name === name || g.code === name);
    setGroupId(id);
    if (next && untouched) setName(next.name);
  }

  function toggleGrade(g: string) {
    setGrades((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));
  }

  function addOption() {
    setOptions((cur) => [
      ...cur,
      { key: `new${Date.now()}${cur.length}`, id: null, groupId: null, name: '', description: '' },
    ]);
  }

  function editOption(key: string, patch: Partial<DraftOption>) {
    setOptions((cur) => cur.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  }

  async function submit() {
    if (saving) return;
    if (!groupId) {
      toast.error('เลือกกลุ่มวิชาของ Track นี้');
      return;
    }
    setSaving(true);
    const r = await saveTrack(track?.id ?? null, {
      yearId,
      semester,
      groupId,
      phase,
      name,
      description,
      admissionNote,
      gradeLevels: grades,
      opensAt,
      closesAt,
      options: options
        .filter((o) => o.name.trim())
        .map((o) => ({
          id: o.id,
          groupId: o.groupId,
          name: o.name,
          description: o.description,
        })),
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
      labelledBy="track-form-title"
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
      <h2 id="track-form-title" className="text-base font-semibold">
        {track ? 'แก้ไข Track' : 'สร้าง Track'}
      </h2>
      <div className="mt-4 space-y-3.5">
        <div>
          <Label htmlFor="t-group">กลุ่มวิชา</Label>
          {groups.length ? (
            <>
              <Select
                id="t-group"
                value={groupId ?? ''}
                onChange={(e) => pickGroup(Number(e.target.value) || null)}
                autoFocus
              >
                <option value="">— เลือกกลุ่มวิชา —</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.code} — {g.name} ({g.subjects.length} วิชา)
                  </option>
                ))}
              </Select>
              <p className="mt-1.5 text-xs text-muted-foreground">
                ชื่อ Track ตั้งต้นจากกลุ่มที่เลือก และวิชาที่นักเรียนจะได้เรียนก็มาจากกลุ่มนี้
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              ยังไม่มีกลุ่มวิชาในระบบ — สร้างที่หน้า “กลุ่มวิชา” ก่อน แล้วจึงสร้าง Track
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="t-name">ชื่อ Track</Label>
          <Input
            id="t-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น TrackSM"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            แก้ได้ — ใช้เมื่อเปิดกลุ่มเดียวกันสองช่วงในภาคเรียนเดียว จะได้แยกออกจากกัน
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="t-year">ปีการศึกษา</Label>
            <Select id="t-year" value={yearId} onChange={(e) => setYearId(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.year}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="t-sem">ภาคเรียน</Label>
            <Select
              id="t-sem"
              value={semester}
              onChange={(e) => setSemester(Number(e.target.value))}
            >
              {SEMESTERS.map((s) => (
                <option key={s} value={s}>
                  ภาคเรียนที่ {s}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="t-phase">ช่วง</Label>
            <Select
              id="t-phase"
              value={phase ?? ''}
              onChange={(e) => setPhase(Number(e.target.value) || null)}
            >
              <option value="">ทั้งภาคเรียน</option>
              {PHASES.map((p) => (
                <option key={p} value={p}>
                  ช่วงที่ {p}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="rounded-xl border border-border p-3.5">
          <div className="flex items-center gap-2">
            <Layers className="size-4.5 text-muted-foreground" strokeWidth={1.8} />
            <p className="text-sm font-medium">
              วิชาที่นักเรียนจะได้เรียน — ภาคเรียนที่ {semester} {trackPhaseLabel(phase)}
            </p>
          </div>
          <div className="mt-2.5">
            {group ? (
              <SubjectList
                subjects={preview(groupId)}
                empty={`กลุ่ม ${group.code} ยังไม่มีวิชาในช่วงนี้ — ไปกำหนดช่วงให้วิชาที่หน้า “วิชาเสริม”`}
              />
            ) : (
              <p className="text-xs text-muted-foreground">เลือกกลุ่มวิชาก่อน</p>
            )}
          </div>
        </div>

        <div>
          <Label>ระดับชั้นที่เลือก Track นี้ได้</Label>
          <div className="flex flex-wrap gap-2">
            {GRADE_LEVELS.map((g) => {
              const on = grades.includes(g);
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => toggleGrade(g)}
                  className={cn(
                    'h-10 rounded-lg border px-4 text-sm font-medium transition-colors',
                    on
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card hover:bg-secondary/60',
                  )}
                >
                  {g}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            ไม่เลือกเลย = เปิดให้ทุกระดับชั้น
          </p>
        </div>

        <div className="rounded-xl border border-border p-3.5">
          <p className="text-sm font-medium">ช่วงเวลาที่เปิดให้เลือก (ไม่บังคับ)</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            เวลาโรงเรียน — นักเรียนจะกดเลือกได้เฉพาะในช่วงนี้ ส่วนผู้ดูแลยังเพิ่ม แก้ไข
            และลบได้ตลอดเวลา
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="t-opens">เปิดให้เลือก</Label>
              <Input
                id="t-opens"
                type="datetime-local"
                value={opensAt}
                onChange={(e) => setOpensAt(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="t-closes">ปิดรับ</Label>
              <Input
                id="t-closes"
                type="datetime-local"
                value={closesAt}
                min={opensAt || undefined}
                onChange={(e) => setClosesAt(e.target.value)}
              />
            </div>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{windowHint(opensAt, closesAt)}</p>
        </div>

        <div>
          <Label htmlFor="t-desc">คำอธิบายสั้น (ไม่บังคับ)</Label>
          <Textarea
            id="t-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="หนึ่งบรรทัดที่นักเรียนเห็นในรายการ"
          />
        </div>

        <div>
          <Label htmlFor="t-admission">เรียนแล้วเหมาะกับคณะ/มหาวิทยาลัยอะไร (ไม่บังคับ)</Label>
          <Textarea
            id="t-admission"
            rows={4}
            value={admissionNote}
            onChange={(e) => setAdmissionNote(e.target.value)}
            placeholder="เช่น เหมาะกับคณะวิศวกรรมศาสตร์ วิทยาศาสตร์ …"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            นักเรียนอ่านข้อความนี้ในหน้า “ดูรายละเอียด” ก่อนตัดสินใจเลือก
          </p>
        </div>

        <div className="rounded-xl border border-border p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">ข้อย่อย (ไม่บังคับ)</p>
              <p className="text-xs text-muted-foreground">
                เช่น TrackSM มี “กฎหมาย” และ “บริหาร” — ถ้ามีข้อย่อย นักเรียนต้องเลือกหนึ่งข้อ
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={addOption} type="button">
              <Plus className="size-4" strokeWidth={1.8} />
              เพิ่ม
            </Button>
          </div>

          {options.length ? (
            <ul className="mt-3 space-y-3">
              {options.map((o) => (
                <li key={o.key} className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Input
                      value={o.name}
                      onChange={(e) => editOption(o.key, { name: e.target.value })}
                      placeholder="ชื่อข้อย่อย เช่น กฎหมาย"
                      className="h-10"
                    />
                    <Input
                      value={o.description}
                      onChange={(e) => editOption(o.key, { description: e.target.value })}
                      placeholder="คำอธิบาย (ไม่บังคับ)"
                      className="h-9 text-xs"
                    />
                    <Select
                      value={o.groupId ?? ''}
                      onChange={(e) =>
                        editOption(o.key, { groupId: Number(e.target.value) || null })
                      }
                      className="h-9 text-xs"
                    >
                      <option value="">ใช้วิชาของ Track (ไม่แยกกลุ่มวิชา)</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.code} — {g.name}
                        </option>
                      ))}
                    </Select>
                    {o.groupId ? (
                      <div className="rounded-lg border border-border/60 p-2.5">
                        <SubjectList subjects={preview(o.groupId)} />
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    title="นำออก"
                    onClick={() => setOptions((cur) => cur.filter((x) => x.key !== o.key))}
                    className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="size-4.5" strokeWidth={1.8} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
