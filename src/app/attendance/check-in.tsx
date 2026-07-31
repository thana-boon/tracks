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
import { ClassDayCalendar } from '@/components/class-day-calendar';
import {
  THAI_WEEKDAYS,
  THAI_WEEKDAYS_SHORT,
  thaiDateLong,
  thaiDateShort,
  weekdayOfYmd,
  cn,
} from '@/lib/utils';
import { DAY_OUTCOME_LABEL, dayOutcome, type DayResult } from '@/lib/evaluate';
import type { ClassDay, SectionOnDay } from '@/lib/subjects-for-user';
import type { DayRosterEntry } from '@/lib/data';
import { loadSectionsOnDate, loadDayRoster, saveDayAttendance } from './actions';

type Slot = 'morning' | 'afternoon';

/**
 * เช็คชื่อ is done standing in the room with a phone in one hand, so this whole
 * flow is laid out for a 360px screen first and only spreads out on a desktop:
 * no sideways scrolling, thumb-sized มา/ไม่มา buttons, and บันทึก pinned to the
 * bottom of the screen so a class of forty never puts it out of reach.
 */
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
      <div className="space-y-4 sm:space-y-6">
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
    <div className="space-y-4 sm:space-y-6">
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
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">เช็คชื่อ</h1>
      <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
        เลือกกลุ่มเรียน → กด “มาทั้งหมด” แล้วแก้เฉพาะคนที่ไม่มา
        <span className="hidden sm:inline"> · ย้อนไปวันอื่นได้ที่ปุ่ม “เปลี่ยนวัน”</span>
      </p>
    </div>
  );
}

/**
 * Step 1 — pick the day, from a calendar rather than a list.
 *
 * Reached only when today is not a class day, or when the teacher pressed
 * เปลี่ยนวัน to go back and fix an older check-in.
 */
function DayList({
  days,
  today,
  onPick,
}: {
  days: ClassDay[];
  today: string;
  onPick: (date: string) => void;
}) {
  return (
    <Card>
      <CardHeader
        icon={<CalendarDays className="size-4.5" strokeWidth={1.8} />}
        title="เลือกวันที่จะเช็คชื่อ"
        action={<Badge tone="secondary">ทั้งปี {days.length} วัน</Badge>}
      />
      <div className="px-3 pb-4 sm:px-5">
        <ClassDayCalendar days={days} today={today} onPick={onPick} />
      </div>
    </Card>
  );
}

/**
 * Step 2 — what meets that day, where, and how far the check-in has got.
 *
 * On a phone each กลุ่ม is a full-width stack — subject, then where and how
 * many, then how far the two slots have got — rather than columns squeezed
 * against a chevron.
 */
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
        className="p-3 sm:p-5"
        icon={<ClipboardCheck className="size-4.5" strokeWidth={1.8} />}
        title={
          <>
            <span className="sm:hidden">
              {THAI_WEEKDAYS_SHORT[weekdayOfYmd(date)]} {thaiDateShort(date)}
            </span>
            <span className="hidden sm:inline">
              วัน{THAI_WEEKDAYS[weekdayOfYmd(date)]}ที่ {thaiDateLong(date)}
            </span>
          </>
        }
        action={
          <Button variant="ghost" size="sm" className="px-2 sm:px-3" onClick={onBack}>
            <ArrowLeft className="size-4" strokeWidth={1.9} />
            เปลี่ยนวัน
          </Button>
        }
      />
      <div className="px-2 pb-3 sm:px-5 sm:pb-4">
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
                  className="flex w-full touch-manipulation items-center gap-3 rounded-xl px-2 py-3 text-left transition-colors hover:bg-secondary/50 active:bg-secondary/70"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-xs font-bold text-secondary-foreground">
                    {s.subjectCode}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate font-medium">{s.subjectName}</span>
                      <Badge tone="navy">{s.name}</Badge>
                    </span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3.5" strokeWidth={1.8} />
                        {s.room ?? 'ยังไม่ระบุห้อง'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="size-3.5" strokeWidth={1.8} />
                        {s.studentCount} คน
                      </span>
                      <span className="hidden sm:inline">{s.groupCode}</span>
                      {s.teacherName ? (
                        <span className="hidden sm:inline">ครู {s.teacherName}</span>
                      ) : null}
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      <SlotChip label="เช้า" done={s.morningChecked} />
                      <SlotChip label="บ่าย" done={s.afternoonChecked} />
                    </span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
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
 * The roster is a list rather than a table — a table wide enough for both slots
 * has to be scrolled sideways on a phone, which is exactly the screen this is
 * filled in on. บันทึก sits in a bar stuck to the bottom of the screen so it is
 * always one press away, however far down the list the teacher has got.
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
    <div className="space-y-3 sm:space-y-4">
      <Card>
        <div className="flex items-start gap-3 p-3 sm:p-5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <ClipboardCheck className="size-4.5" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold sm:text-base">
              <span className="min-w-0 truncate">
                {section.subjectCode} — {section.subjectName}
              </span>
              <Badge tone="navy">{section.name}</Badge>
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarDays className="size-3.5" strokeWidth={1.8} />
                <span className="sm:hidden">
                  {THAI_WEEKDAYS_SHORT[weekdayOfYmd(date)]} {thaiDateShort(date)}
                </span>
                <span className="hidden sm:inline">
                  วัน{THAI_WEEKDAYS[weekdayOfYmd(date)]}ที่ {thaiDateLong(date)}
                </span>
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" strokeWidth={1.8} />
                {section.room ?? 'ยังไม่ระบุห้อง'}
              </span>
              {section.teacherName ? <span>ครู {section.teacherName}</span> : null}
            </div>
          </div>
          <Button variant="ghost" size="sm" className="shrink-0 px-2 sm:px-3" onClick={onBack}>
            <ArrowLeft className="size-4" strokeWidth={1.9} />
            <span className="hidden sm:inline">เปลี่ยนกลุ่ม</span>
          </Button>
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
            <div className="flex flex-wrap gap-2 p-3 sm:p-5 sm:pb-3">
              <Button
                size="sm"
                className="flex-1 whitespace-nowrap px-2 sm:flex-none sm:px-3"
                onClick={() => setWholeDay(true)}
              >
                <CheckCircle2 className="size-4 shrink-0" strokeWidth={1.9} />
                <span className="hidden sm:inline">ทุกคน</span>มาทั้งวัน
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 whitespace-nowrap px-2 sm:flex-none sm:px-3"
                onClick={() => setWholeDay(false)}
              >
                <XCircle className="size-4 shrink-0" strokeWidth={1.9} />
                <span className="hidden sm:inline">ทุกคน</span>ไม่มาทั้งวัน
              </Button>
              <span className="hidden self-center text-xs text-muted-foreground sm:ml-auto sm:block">
                กดมาทั้งหมดก่อน แล้วค่อยกดแก้เฉพาะคนที่ไม่มา
              </span>
            </div>
            <div className="grid gap-2.5 border-t border-border/60 p-3 sm:grid-cols-2 sm:gap-3 sm:p-5">
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
          </Card>

          <Card>
            <CardHeader
              className="p-3 sm:p-5"
              icon={<Users className="size-4.5" strokeWidth={1.8} />}
              title={`รายชื่อ ${roster.length} คน`}
              action={
                bothDone ? (
                  <Badge tone="success">ประเมินผลแล้ว</Badge>
                ) : (
                  <Badge tone="secondary">เช็คให้ครบเช้า-บ่าย</Badge>
                )
              }
            />
            <ul className="divide-y divide-border/60 border-t border-border/60">
              {roster.map((e, i) => {
                const m = touched.morning ? marks.morning.get(e.studentId) ?? false : null;
                const a = touched.afternoon ? marks.afternoon.get(e.studentId) ?? false : null;
                return (
                  <RosterRow
                    key={e.studentId}
                    order={i + 1}
                    entry={e}
                    morning={m}
                    afternoon={a}
                    ready={bothDone}
                    onSet={(slot, v) => setOne(slot, e.studentId, v)}
                  />
                );
              })}
            </ul>

            {/*
              Pinned to the bottom of the screen for as long as the roster is on
              it: with forty students the old footer button was a long scroll
              away from whichever row was just fixed.
            */}
            <div className="sticky bottom-0 z-20 rounded-b-2xl border-t border-border/60 bg-card/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-10px_24px_-16px_rgba(0,0,0,0.35)] backdrop-blur sm:flex sm:items-center sm:gap-4 sm:p-5">
              <p className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:mb-0 sm:flex-1">
                <SavedCount slot="morning" touched={touched.morning} present={present('morning')} total={roster.length} />
                <SavedCount slot="afternoon" touched={touched.afternoon} present={present('afternoon')} total={roster.length} />
              </p>
              <Button
                size="lg"
                className="w-full sm:w-auto"
                onClick={submit}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="size-4.5 animate-spin" />
                ) : (
                  <Save className="size-4.5" strokeWidth={1.8} />
                )}
                บันทึกเช็คชื่อ
              </Button>
            </div>
          </Card>

          <p className="px-1 pb-1 text-center text-xs text-muted-foreground">
            มาแค่เช้าหรือบ่าย = ผ่าน · มาครบทั้งวัน = ยอดเยี่ยม · ไม่มาเลย = ไม่ผ่าน
            <span className="hidden sm:inline">
              {' '}
              · คอลัมน์ “ที่” เรียงลำดับเดียวกับใบเช็คชื่อที่พิมพ์ · “เลขที่” คือเลขที่ห้องจริงของนักเรียน
            </span>
          </p>
        </>
      )}
    </div>
  );
}

/** One student. Phone: name on top, both slots on a full-width second line. */
function RosterRow({
  order,
  entry,
  morning,
  afternoon,
  ready,
  onSet,
}: {
  order: number;
  entry: DayRosterEntry;
  morning: boolean | null;
  afternoon: boolean | null;
  ready: boolean;
  onSet: (slot: Slot, value: boolean) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:flex-nowrap sm:gap-x-4 sm:px-5 sm:py-2 sm:hover:bg-secondary/40">
      {/* ลำดับเดียวกับใบเช็คชื่อที่พิมพ์ — a phone has no room for it */}
      <span
        className="hidden w-6 shrink-0 text-center text-xs text-muted-foreground tabular-nums sm:block"
        title="ลำดับเดียวกับใบเช็คชื่อที่พิมพ์"
      >
        {order}
      </span>
      <span
        className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-sm font-semibold text-secondary-foreground tabular-nums"
        title="เลขที่ในห้องเรียน"
      >
        {entry.classNumber ?? <span className="text-muted-foreground">—</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {entry.fullName}
          {entry.nickname ? (
            <span className="font-normal text-muted-foreground"> ({entry.nickname})</span>
          ) : null}
        </span>
        <span className="block truncate text-xs text-muted-foreground tabular-nums">
          {entry.code} · {entry.gradeLevel}/{entry.classroom}
        </span>
      </span>
      <span className="shrink-0 sm:order-2 sm:w-24 sm:text-right">
        <OutcomeBadge morning={morning} afternoon={afternoon} ready={ready} />
      </span>
      <span className="flex basis-full items-center gap-2 sm:order-1 sm:basis-auto sm:gap-3">
        <SlotToggle slot="morning" student={entry.fullName} value={morning} onSet={onSet} />
        <SlotToggle slot="afternoon" student={entry.fullName} value={afternoon} onSet={onSet} />
      </span>
    </li>
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
    <div className="rounded-xl border border-border p-3">
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
      <div className="mt-2.5 flex gap-2">
        <Button size="sm" variant="secondary" className="flex-1" onClick={() => onAll(slot, true)}>
          มาทั้งหมด
        </Button>
        <Button size="sm" variant="outline" className="flex-1" onClick={() => onAll(slot, false)}>
          ไม่มาทั้งหมด
        </Button>
      </div>
    </div>
  );
}

/** What the save bar reports for one slot. */
function SavedCount({
  slot,
  touched,
  present,
  total,
}: {
  slot: Slot;
  touched: boolean;
  present: number;
  total: number;
}) {
  const isMorning = slot === 'morning';
  const Icon = isMorning ? Sun : Moon;
  return (
    <span className="flex items-center gap-1.5">
      <Icon className="size-3.5" strokeWidth={1.8} />
      {isMorning ? 'เช้า' : 'บ่าย'}{' '}
      {touched ? (
        <span className="font-medium text-foreground tabular-nums">
          มา {present}/{total}
        </span>
      ) : (
        'ยังไม่เช็ค'
      )}
    </span>
  );
}

/**
 * มา / ไม่มา for one slot of one student, with the slot's own icon so the pair
 * reads without a column heading — there are no columns on a phone.
 */
function SlotToggle({
  slot,
  student,
  value,
  onSet,
}: {
  slot: Slot;
  /** only read out — thirty rows of a bare “มา” tell a screen reader nothing */
  student: string;
  value: boolean | null;
  onSet: (slot: Slot, value: boolean) => void;
}) {
  const Icon = slot === 'morning' ? Sun : Moon;
  const label = `ช่วง${slot === 'morning' ? 'เช้า' : 'บ่าย'} · ${student}`;
  return (
    <span className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-secondary/40 py-1.5 sm:flex-none sm:bg-transparent sm:py-0">
      <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} />
      <PresenceButton
        active={value === true}
        tone="present"
        label={label}
        onClick={() => onSet(slot, true)}
      />
      <PresenceButton
        active={value === false}
        tone="absent"
        label={label}
        onClick={() => onSet(slot, false)}
      />
    </span>
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
  label,
  onClick,
}: {
  active: boolean;
  tone: 'present' | 'absent';
  /** what this button is for, appended to มา/ไม่มา */
  label?: string;
  onClick: () => void;
}) {
  const Icon = tone === 'present' ? CheckCircle2 : XCircle;
  const verb = tone === 'present' ? 'มา' : 'ไม่มา';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label ? `${verb} — ${label}` : verb}
      aria-pressed={active}
      className={cn(
        'grid size-10 shrink-0 touch-manipulation place-items-center rounded-lg border transition-colors active:scale-95 sm:size-9',
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
