'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  CalendarDays,
  ClipboardCheck,
  Sun,
  Moon,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  MapPin,
  ChevronRight,
  ArrowLeft,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardHeader, Button, Badge, EmptyState } from '@/components/ui';
import {
  THAI_WEEKDAYS,
  thaiDateLong,
  weekdayOfYmd,
  cn,
} from '@/lib/utils';
import { DAY_OUTCOME_LABEL, dayOutcome, type DayResult } from '@/lib/evaluate';
import type { ClassDay, SectionOnDay } from '@/lib/subjects-for-user';
import type { DayRosterEntry } from '@/lib/data';
import { loadSectionsOnDate, loadDayRoster, saveDayAttendance } from './actions';

type Slot = 'morning' | 'afternoon';

export function CheckIn({
  days,
  today,
  startDate = null,
  startSection = null,
}: {
  days: ClassDay[];
  today: string;
  /** step to open on, when linked to from ผลเช็คชื่อ */
  startDate?: string | null;
  startSection?: SectionOnDay | null;
}) {
  const [date, setDate] = useState<string | null>(startDate);
  const [section, setSection] = useState<SectionOnDay | null>(startSection);

  if (days.length === 0) {
    return (
      <div className="space-y-6">
        <Header />
        <EmptyState
          icon={<ClipboardCheck className="size-8" strokeWidth={1.5} />}
          title="ยังไม่มีวันเรียนให้เช็คชื่อ"
          hint="กำหนดวันเรียนของกลุ่มเรียนก่อนที่หน้า “จัดนักเรียนเข้าวิชา” — เฉพาะวันที่มีเรียนเท่านั้นที่จะขึ้นมาให้เลือก"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header />
      {date === null ? (
        <DayList days={days} today={today} onPick={setDate} />
      ) : section === null ? (
        <SectionList date={date} onBack={() => setDate(null)} onPick={setSection} />
      ) : (
        <RosterEditor
          key={`${section.id}:${date}`}
          date={date}
          section={section}
          onBack={() => setSection(null)}
        />
      )}
    </div>
  );
}

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">เช็คชื่อ</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        เลือกวัน → เลือกกลุ่มเรียน → กดมาทั้งหมดแล้วแก้เฉพาะคนที่ไม่มา · เช็คได้ทั้งเช้าและบ่าย
      </p>
    </div>
  );
}

/** Step 1 — the class days of the year, most recent first once they are past. */
function DayList({
  days,
  today,
  onPick,
}: {
  days: ClassDay[];
  today: string;
  onPick: (date: string) => void;
}) {
  const upcoming = days.filter((d) => d.date >= today);
  const past = days.filter((d) => d.date < today).reverse();

  return (
    <Card>
      <CardHeader
        icon={<CalendarDays className="size-4.5" strokeWidth={1.8} />}
        title="เลือกวันที่จะเช็คชื่อ"
        action={<Badge tone="secondary">{days.length} วัน</Badge>}
      />
      <div className="px-4 pb-4 sm:px-5">
        {upcoming.length > 0 ? (
          <Section title="วันนี้และวันข้างหน้า">
            {upcoming.map((d) => (
              <DayRow key={d.date} day={d} today={today} onPick={onPick} />
            ))}
          </Section>
        ) : null}
        {past.length > 0 ? (
          <Section title="ย้อนหลัง">
            {past.map((d) => (
              <DayRow key={d.date} day={d} today={today} onPick={onPick} />
            ))}
          </Section>
        ) : null}
      </div>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-1">
      <p className="px-1 pb-1 pt-3 text-xs font-medium text-muted-foreground">{title}</p>
      <ul className="divide-y divide-border/60">{children}</ul>
    </div>
  );
}

function DayRow({
  day,
  today,
  onPick,
}: {
  day: ClassDay;
  today: string;
  onPick: (date: string) => void;
}) {
  const isToday = day.date === today;
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(day.date)}
        className="flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-secondary/50"
      >
        <span
          className={cn(
            'grid size-11 shrink-0 place-items-center rounded-xl text-sm font-bold tabular-nums',
            isToday ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground',
          )}
        >
          {Number(day.date.slice(-2))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">วัน{THAI_WEEKDAYS[weekdayOfYmd(day.date)]}</span>
            {isToday ? <Badge tone="primary">วันนี้</Badge> : null}
          </span>
          <span className="block text-xs text-muted-foreground">{thaiDateLong(day.date)}</span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">{day.sectionCount} กลุ่ม</span>
        <ChevronRight className="size-4.5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
      </button>
    </li>
  );
}

/** Step 2 — what meets that day, where, and how far the check-in has got. */
function SectionList({
  date,
  onBack,
  onPick,
}: {
  date: string;
  onBack: () => void;
  onPick: (s: SectionOnDay) => void;
}) {
  const [sections, setSections] = useState<SectionOnDay[] | null>(null);
  const [loading, startLoad] = useTransition();

  useEffect(() => {
    startLoad(async () => {
      const r = await loadSectionsOnDate(date);
      if (!r.ok) toast.error(r.message ?? 'โหลดกลุ่มเรียนไม่สำเร็จ');
      setSections(r.sections);
    });
  }, [date]);

  return (
    <Card>
      <CardHeader
        icon={<ClipboardCheck className="size-4.5" strokeWidth={1.8} />}
        title={`วัน${THAI_WEEKDAYS[weekdayOfYmd(date)]}ที่ ${thaiDateLong(date)}`}
        action={
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="size-4" strokeWidth={1.9} />
            เปลี่ยนวัน
          </Button>
        }
      />
      <div className="px-4 pb-4 sm:px-5">
        {loading || !sections ? (
          <Spinner />
        ) : sections.length === 0 ? (
          <EmptyState title="ไม่มีกลุ่มเรียนในวันนี้" hint="เลือกวันอื่น หรือกำหนดวันเรียนเพิ่มที่หน้าจัดนักเรียนเข้าวิชา" />
        ) : (
          <ul className="divide-y divide-border/60">
            {sections.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onPick(s)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-secondary/50"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-xs font-bold text-secondary-foreground">
                    {s.subjectCode}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{s.subjectName}</span>
                      <Badge tone="navy">{s.name}</Badge>
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{s.groupCode}</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3.5" strokeWidth={1.8} />
                        {s.room ?? 'ยังไม่ระบุห้อง'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="size-3.5" strokeWidth={1.8} />
                        {s.studentCount} คน
                      </span>
                      {s.teacherName ? <span>ครู {s.teacherName}</span> : null}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <SlotChip label="เช้า" done={s.morningChecked} />
                    <SlotChip label="บ่าย" done={s.afternoonChecked} />
                  </span>
                  <ChevronRight className="size-4.5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function SlotChip({ label, done }: { label: string; done: boolean }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[11px] font-medium',
        done ? 'bg-success/10 text-success' : 'bg-secondary text-muted-foreground',
      )}
    >
      {label} {done ? 'เช็คแล้ว' : 'ยังไม่เช็ค'}
    </span>
  );
}

/**
 * Step 3 — the roster for one รอบเรียน on one day. Both slots live on the same
 * screen: a teacher presses มาทั้งหมด for the slot and then fixes the handful
 * who were away, which is how the check actually happens in the room.
 *
 * A slot only gets written once it has been touched — an untouched afternoon
 * stays unrecorded rather than being saved as everyone-absent.
 */
function RosterEditor({
  date,
  section,
  onBack,
}: {
  date: string;
  section: SectionOnDay;
  onBack: () => void;
}) {
  const [roster, setRoster] = useState<DayRosterEntry[] | null>(null);
  const [marks, setMarks] = useState<Record<Slot, Map<number, boolean>>>({
    morning: new Map(),
    afternoon: new Map(),
  });
  const [touched, setTouched] = useState<Record<Slot, boolean>>({
    morning: false,
    afternoon: false,
  });
  const [loading, startLoad] = useTransition();
  const [saving, setSaving] = useState(false);

  function refresh() {
    startLoad(async () => {
      const r = await loadDayRoster(section.id, date);
      if (!r.ok) {
        toast.error(r.message ?? 'โหลดรายชื่อไม่สำเร็จ');
        setRoster([]);
        return;
      }
      setRoster(r.roster);
      setMarks({
        morning: new Map(
          r.roster.filter((e) => e.morning !== null).map((e) => [e.studentId, e.morning!]),
        ),
        afternoon: new Map(
          r.roster.filter((e) => e.afternoon !== null).map((e) => [e.studentId, e.afternoon!]),
        ),
      });
      setTouched({
        morning: r.roster.some((e) => e.morning !== null),
        afternoon: r.roster.some((e) => e.afternoon !== null),
      });
    });
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.id, date]);

  function setAll(slot: Slot, value: boolean) {
    if (!roster) return;
    setMarks((m) => ({ ...m, [slot]: new Map(roster.map((e) => [e.studentId, value])) }));
    setTouched((t) => ({ ...t, [slot]: true }));
  }
  function setOne(slot: Slot, studentId: number, value: boolean) {
    setMarks((m) => ({ ...m, [slot]: new Map(m[slot]).set(studentId, value) }));
    setTouched((t) => ({ ...t, [slot]: true }));
  }
  function setWholeDay(value: boolean) {
    setAll('morning', value);
    setAll('afternoon', value);
  }

  async function submit() {
    if (!roster || saving) return;
    if (!touched.morning && !touched.afternoon) {
      toast.error('ยังไม่ได้เช็คช่วงใดเลย — กด “มาทั้งหมด” หรือเลือกรายคนก่อน');
      return;
    }
    setSaving(true);
    const slotRecords = (slot: Slot) =>
      touched[slot]
        ? roster.map((e) => ({ studentId: e.studentId, present: marks[slot].get(e.studentId) ?? false }))
        : null;
    const r = await saveDayAttendance({
      sectionId: section.id,
      date,
      morning: slotRecords('morning'),
      afternoon: slotRecords('afternoon'),
    });
    setSaving(false);
    if (r.ok) {
      toast.success(r.message);
      refresh();
    } else {
      toast.error(r.message);
    }
  }

  const present = (slot: Slot) =>
    roster ? roster.filter((e) => marks[slot].get(e.studentId)).length : 0;
  const bothDone = touched.morning && touched.afternoon;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={<ClipboardCheck className="size-4.5" strokeWidth={1.8} />}
          title={
            <span className="flex flex-wrap items-center gap-2">
              {section.subjectCode} — {section.subjectName}
              <Badge tone="navy">{section.name}</Badge>
            </span>
          }
          action={
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="size-4" strokeWidth={1.9} />
              เปลี่ยนกลุ่ม
            </Button>
          }
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-4 text-xs text-muted-foreground sm:px-5">
          <span className="flex items-center gap-1">
            <CalendarDays className="size-3.5" strokeWidth={1.8} />
            วัน{THAI_WEEKDAYS[weekdayOfYmd(date)]}ที่ {thaiDateLong(date)}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="size-3.5" strokeWidth={1.8} />
            {section.room ?? 'ยังไม่ระบุห้อง'}
          </span>
          {section.teacherName ? <span>ครู {section.teacherName}</span> : null}
        </div>
      </Card>

      {loading || !roster ? (
        <Card>
          <Spinner />
        </Card>
      ) : roster.length === 0 ? (
        <EmptyState
          title="ยังไม่มีนักเรียนในกลุ่มนี้"
          hint="จัดนักเรียนเข้าวิชาก่อนที่หน้า “จัดนักเรียนเข้าวิชา”"
        />
      ) : (
        <>
          <Card>
            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
              <SlotControls
                slot="morning"
                touched={touched.morning}
                present={present('morning')}
                total={roster.length}
                onAll={setAll}
              />
              <SlotControls
                slot="afternoon"
                touched={touched.afternoon}
                present={present('afternoon')}
                total={roster.length}
                onAll={setAll}
              />
            </div>
            <div className="flex flex-wrap gap-2 border-t border-border/60 px-4 py-3 sm:px-5">
              <Button size="sm" onClick={() => setWholeDay(true)}>
                <CheckCircle2 className="size-4" strokeWidth={1.9} />
                มาทั้งหมด ทั้งวัน
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setWholeDay(false)}>
                <XCircle className="size-4" strokeWidth={1.9} />
                ไม่มาทั้งหมด ทั้งวัน
              </Button>
              <span className="ml-auto self-center text-xs text-muted-foreground">
                กดมาทั้งหมดก่อน แล้วค่อยกดแก้เฉพาะคนที่ไม่มา
              </span>
            </div>
          </Card>

          <Card>
            <CardHeader
              icon={<Users className="size-4.5" strokeWidth={1.8} />}
              title={`รายชื่อนักเรียน ${roster.length} คน`}
              action={
                bothDone ? (
                  <Badge tone="success">ประเมินผลของวันนี้แล้ว</Badge>
                ) : (
                  <Badge tone="secondary">เช็คให้ครบเช้า-บ่ายเพื่อประเมินผล</Badge>
                )
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="w-10 py-2 pl-4 pr-1 text-center font-medium" title="ลำดับเดียวกับใบเช็คชื่อที่พิมพ์">
                      ที่
                    </th>
                    <th className="w-12 px-1 py-2 text-center font-medium" title="เลขที่ในห้องเรียนของนักเรียน">
                      เลขที่
                    </th>
                    <th className="px-3 py-2 text-left font-medium">นักเรียน</th>
                    <th className="px-2 py-2 text-center font-medium">เช้า</th>
                    <th className="px-2 py-2 text-center font-medium">บ่าย</th>
                    <th className="px-3 py-2 text-center font-medium">ผลของวัน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {roster.map((e, i) => {
                    const m = touched.morning ? marks.morning.get(e.studentId) ?? false : null;
                    const a = touched.afternoon ? marks.afternoon.get(e.studentId) ?? false : null;
                    return (
                      <tr key={e.studentId} className="hover:bg-secondary/40">
                        <td className="py-2 pl-4 pr-1 text-center text-xs text-muted-foreground tabular-nums">
                          {i + 1}
                        </td>
                        <td className="px-1 py-2 text-center font-medium tabular-nums">
                          {e.classNumber ?? <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <p className="truncate font-medium">
                            {e.fullName}
                            {e.nickname ? (
                              <span className="font-normal text-muted-foreground"> ({e.nickname})</span>
                            ) : null}
                          </p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {e.code} · {e.gradeLevel}/{e.classroom}
                          </p>
                        </td>
                        <td className="px-2 py-2">
                          <SlotToggle
                            value={m}
                            onSet={(v) => setOne('morning', e.studentId, v)}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <SlotToggle
                            value={a}
                            onSet={(v) => setOne('afternoon', e.studentId, v)}
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <OutcomeBadge morning={m} afternoon={a} ready={bothDone} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-border/60 p-4 sm:p-5">
              <Button className="w-full" onClick={submit} disabled={saving}>
                {saving ? (
                  <Loader2 className="size-4.5 animate-spin" />
                ) : (
                  <Save className="size-4.5" strokeWidth={1.8} />
                )}
                บันทึกเช็คชื่อ
              </Button>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                มาแค่เช้าหรือบ่าย = ผ่าน · มาครบทั้งวัน = ยอดเยี่ยม · ไม่มาเลย = ไม่ผ่าน
              </p>
              <p className="mt-1 text-center text-xs text-muted-foreground">
                คอลัมน์ “ที่” เรียงลำดับเดียวกับใบเช็คชื่อที่พิมพ์ · “เลขที่” คือเลขที่ห้องจริงของนักเรียน
              </p>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function SlotControls({
  slot,
  touched,
  present,
  total,
  onAll,
}: {
  slot: Slot;
  touched: boolean;
  present: number;
  total: number;
  onAll: (slot: Slot, value: boolean) => void;
}) {
  const isMorning = slot === 'morning';
  return (
    <div className="rounded-xl border border-border p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          {isMorning ? (
            <Sun className="size-4.5 text-muted-foreground" strokeWidth={1.8} />
          ) : (
            <Moon className="size-4.5 text-muted-foreground" strokeWidth={1.8} />
          )}
          ช่วง{isMorning ? 'เช้า' : 'บ่าย'}
        </span>
        {touched ? (
          <Badge tone="success">
            มา {present}/{total}
          </Badge>
        ) : (
          <Badge tone="secondary">ยังไม่เช็ค</Badge>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="secondary" className="flex-1" onClick={() => onAll(slot, true)}>
          มาทั้งหมด
        </Button>
        <Button size="sm" variant="ghost" className="flex-1" onClick={() => onAll(slot, false)}>
          ไม่มาทั้งหมด
        </Button>
      </div>
    </div>
  );
}

function SlotToggle({
  value,
  onSet,
}: {
  value: boolean | null;
  onSet: (v: boolean) => void;
}) {
  return (
    <div className="flex justify-center gap-1">
      <PresenceButton active={value === true} tone="present" onClick={() => onSet(true)} />
      <PresenceButton active={value === false} tone="absent" onClick={() => onSet(false)} />
    </div>
  );
}

function OutcomeBadge({
  morning,
  afternoon,
  ready,
}: {
  morning: boolean | null;
  afternoon: boolean | null;
  ready: boolean;
}) {
  if (morning === null && afternoon === null)
    return <span className="text-xs text-muted-foreground">—</span>;
  const result: DayResult = dayOutcome(morning, afternoon);
  const tone = result === 'excellent' ? 'accent' : result === 'partial' ? 'success' : 'destructive';
  return (
    <Badge tone={tone} className={cn(!ready && 'opacity-60')}>
      {DAY_OUTCOME_LABEL[result]}
    </Badge>
  );
}

function PresenceButton({
  active,
  tone,
  onClick,
}: {
  active: boolean;
  tone: 'present' | 'absent';
  onClick: () => void;
}) {
  const Icon = tone === 'present' ? CheckCircle2 : XCircle;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={tone === 'present' ? 'มา' : 'ไม่มา'}
      aria-pressed={active}
      className={cn(
        'grid size-9 place-items-center rounded-lg border transition-colors',
        active
          ? tone === 'present'
            ? 'border-success bg-success/10 text-success'
            : 'border-destructive bg-destructive/10 text-destructive'
          : 'border-border text-muted-foreground hover:bg-secondary/60',
      )}
    >
      <Icon className="size-5" strokeWidth={1.9} />
    </button>
  );
}

function Spinner() {
  return (
    <div className="grid place-items-center py-16 text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
    </div>
  );
}
