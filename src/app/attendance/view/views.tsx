import Link from 'next/link';
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  Eye,
  MapPin,
  Printer,
  Table2,
  Users,
} from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, resultTone } from '@/components/ui';
import { SectionSwitcher } from '@/components/subject-switcher';
import { classDatesOf, dayRoster, evaluateAll, listSections, type DayRosterEntry } from '@/lib/data';
import {
  attendanceDaysOfYear,
  sectionsOnDate,
  type AttendanceDay,
  type SectionOnDay,
} from '@/lib/subjects-for-user';
import {
  DAY_OUTCOME_LABEL,
  DAY_RESULT_LABEL,
  OVERALL_LABEL,
  dayOutcome,
  type DayResult,
} from '@/lib/evaluate';
import {
  THAI_WEEKDAYS,
  THAI_WEEKDAYS_SHORT,
  cn,
  thaiDateLong,
  thaiDateShort,
  thaiMonthLabel,
  weekdayOfYmd,
} from '@/lib/utils';
import type { YearRow } from '@/lib/years';
import { DayFilter, type DayStatus } from './day-filter';

/* ── Step 1 · the class days of the year ─────────────────────────────────── */

/**
 * Every day the school runs วิชาเสริม, with how far its check-in has got. Past
 * days come first and newest-first: an admin opens this screen to find the day
 * someone forgot, which is almost always a day just gone.
 *
 * The list only grows as the year runs, so it opens on the month of the most
 * recent class day rather than on everything, and the filter above it narrows
 * by month and by whether the check-in is still outstanding.
 */
export async function DayList({
  year,
  today,
  month: askedMonth,
  status: askedStatus,
}: {
  year: YearRow;
  today: string;
  month?: string;
  status?: DayStatus;
}) {
  const days = await attendanceDaysOfYear(year);
  if (days.length === 0)
    return (
      <EmptyState
        icon={<CalendarDays className="size-8" strokeWidth={1.5} />}
        title="ยังไม่มีวันเรียนให้ดูผล"
        hint="กำหนดวันเรียนของกลุ่มเรียนก่อนที่หน้า “จัดนักเรียนเข้าวิชา”"
      />
    );

  const months = [...new Set(days.map((d) => d.date.slice(0, 7)))];
  const latestPast = [...days].reverse().find((d) => d.date <= today);
  const fallbackMonth = (latestPast?.date ?? days[0].date).slice(0, 7);
  const month =
    askedMonth === 'all' || (askedMonth && months.includes(askedMonth))
      ? askedMonth
      : fallbackMonth;
  const status: DayStatus =
    askedStatus === 'pending' || askedStatus === 'done' || askedStatus === 'all'
      ? askedStatus
      : 'all';

  const shown = days.filter((d) => {
    if (month !== 'all' && !d.date.startsWith(month)) return false;
    if (status === 'pending') return d.doneCount < d.sectionCount;
    if (status === 'done') return d.doneCount === d.sectionCount;
    return true;
  });
  const past = shown.filter((d) => d.date <= today).reverse();
  const upcoming = shown.filter((d) => d.date > today);
  const pending = days.reduce((n, d) => n + (d.sectionCount - d.doneCount), 0);

  return (
    <div className="space-y-4">
      <DayFilter months={months} month={month} status={status} count={shown.length} />
      <Card>
        <CardHeader
          icon={<CalendarDays className="size-4.5" strokeWidth={1.8} />}
          title={
            month === 'all' ? 'เลือกวันที่จะดูผล' : `เลือกวันที่จะดูผล · ${thaiMonthLabel(month)}`
          }
          action={
            pending > 0 ? (
              <Badge tone="destructive">ทั้งปี ยังเช็คไม่ครบ {pending} กลุ่ม</Badge>
            ) : (
              <Badge tone="success">เช็คครบทุกกลุ่ม</Badge>
            )
          }
        />
        <div className="px-4 pb-4 sm:px-5">
          {shown.length === 0 ? (
            <div className="py-6">
              <EmptyState
                title="ไม่มีวันที่ตรงกับตัวกรอง"
                hint="ลองเปลี่ยนเดือน หรือเลือกสถานะเป็น “ทั้งหมด”"
              />
            </div>
          ) : null}
          {past.length > 0 ? (
            <DayGroup title="วันนี้และย้อนหลัง">
              {past.map((d) => (
                <DayRow key={d.date} day={d} today={today} />
              ))}
            </DayGroup>
          ) : null}
          {upcoming.length > 0 ? (
            <DayGroup title="วันข้างหน้า">
              {upcoming.map((d) => (
                <DayRow key={d.date} day={d} today={today} />
              ))}
            </DayGroup>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function DayGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-1">
      <p className="px-1 pb-1 pt-3 text-xs font-medium text-muted-foreground">{title}</p>
      <ul className="divide-y divide-border/60">{children}</ul>
    </div>
  );
}

function DayRow({ day, today }: { day: AttendanceDay; today: string }) {
  const isToday = day.date === today;
  const done = day.doneCount === day.sectionCount;
  const untouched = day.doneCount === 0 && day.partialCount === 0;
  return (
    <li>
      <Link
        href={`/attendance/view?date=${day.date}`}
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
          <span className="block text-xs text-muted-foreground">
            {thaiDateLong(day.date)} · {day.sectionCount} กลุ่ม
          </span>
        </span>
        <span className="shrink-0">
          {done ? (
            <Badge tone="success">เช็คครบแล้ว</Badge>
          ) : untouched ? (
            <Badge tone="destructive">ยังไม่เช็คเลย</Badge>
          ) : (
            <Badge tone="accent">
              เช็คแล้ว {day.doneCount}/{day.sectionCount} กลุ่ม
            </Badge>
          )}
        </span>
        <ChevronRight className="size-4.5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
      </Link>
    </li>
  );
}

/* ── Step 2 · what meets that day, and whether it has been checked ───────── */

/** The กลุ่มเรียน of one day: room, teacher, slot status, and where to go next. */
export async function SectionsOnDay({ year, date }: { year: YearRow; date: string }) {
  const sections = await sectionsOnDate(year, date);
  const done = sections.filter((s) => s.morningChecked && s.afternoonChecked).length;

  return (
    <Card>
      <CardHeader
        icon={<ClipboardCheck className="size-4.5" strokeWidth={1.8} />}
        title={`วัน${THAI_WEEKDAYS[weekdayOfYmd(date)]}ที่ ${thaiDateLong(date)}`}
        action={
          <div className="flex items-center gap-2">
            {sections.length > 0 ? (
              <Badge tone={done === sections.length ? 'success' : 'accent'}>
                เช็คครบ {done}/{sections.length} กลุ่ม
              </Badge>
            ) : null}
            <Link href="/attendance/view">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="size-4" strokeWidth={1.9} />
                เปลี่ยนวัน
              </Button>
            </Link>
          </div>
        }
      />
      <div className="px-4 pb-4 sm:px-5">
        {sections.length === 0 ? (
          <EmptyState
            title="ไม่มีกลุ่มเรียนในวันนี้"
            hint="เลือกวันอื่น หรือกำหนดวันเรียนเพิ่มที่หน้าจัดนักเรียนเข้าวิชา"
          />
        ) : (
          <ul className="divide-y divide-border/60">
            {sections.map((s) => (
              <SectionRow key={s.id} section={s} date={date} />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function SectionRow({ section: s, date }: { section: SectionOnDay; date: string }) {
  const checked = s.morningChecked || s.afternoonChecked;
  const full = s.morningChecked && s.afternoonChecked;
  return (
    <li className="flex flex-wrap items-center gap-3 px-2 py-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-xs font-bold text-secondary-foreground">
        {s.subjectCode}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{s.subjectName}</span>
          <Badge tone="navy">{s.name}</Badge>
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
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
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <SlotChip label="เช้า" present={s.morningPresent} total={s.studentCount} />
        <SlotChip label="บ่าย" present={s.afternoonPresent} total={s.studentCount} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {checked ? (
          <Link href={`/attendance/view?date=${date}&section=${s.id}`}>
            <Button variant="outline" size="sm">
              <Eye className="size-4" strokeWidth={1.8} />
              รายละเอียด
            </Button>
          </Link>
        ) : (
          <Button variant="outline" size="sm" disabled title="ยังไม่ได้เช็คชื่อกลุ่มนี้">
            <Eye className="size-4" strokeWidth={1.8} />
            รายละเอียด
          </Button>
        )}
        <Link href={`/attendance?date=${date}&section=${s.id}`}>
          <Button variant={full ? 'secondary' : 'primary'} size="sm">
            <ClipboardCheck className="size-4" strokeWidth={1.8} />
            {full ? 'แก้ไขการเช็ค' : 'ไปเช็คชื่อ'}
          </Button>
        </Link>
      </div>
    </li>
  );
}

function SlotChip({
  label,
  present,
  total,
}: {
  label: string;
  present: number | null;
  total: number;
}) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[11px] font-medium',
        present === null ? 'bg-secondary text-muted-foreground' : 'bg-success/10 text-success',
      )}
    >
      {present === null ? `${label} ยังไม่เช็ค` : `${label} มา ${present}/${total}`}
    </span>
  );
}

/* ── Step 3 · one กลุ่ม on one day, student by student ───────────────────── */

export async function DayDetail({
  year,
  date,
  sectionId,
}: {
  year: YearRow;
  date: string;
  sectionId: number;
}) {
  const sections = await sectionsOnDate(year, date);
  const section = sections.find((s) => s.id === sectionId);
  if (!section)
    return (
      <EmptyState
        title="กลุ่มนี้ไม่ได้เรียนในวันที่เลือก"
        hint="ย้อนกลับไปเลือกกลุ่มเรียนของวันนั้นอีกครั้ง"
        action={
          <Link href={`/attendance/view?date=${date}`} className="mt-2">
            <Button variant="secondary" size="md">
              <ArrowLeft className="size-4" strokeWidth={1.9} />
              กลับไปเลือกกลุ่ม
            </Button>
          </Link>
        }
      />
    );

  const roster = await dayRoster(sectionId, date);
  const outcomes = { excellent: 0, partial: 0, absent: 0, pending: 0 };
  for (const e of roster) {
    if (e.morning === null && e.afternoon === null) outcomes.pending += 1;
    else outcomes[dayOutcome(e.morning, e.afternoon)] += 1;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          icon={<Eye className="size-4.5" strokeWidth={1.8} />}
          title={
            <span className="flex flex-wrap items-center gap-2">
              {section.subjectCode} — {section.subjectName}
              <Badge tone="navy">{section.name}</Badge>
            </span>
          }
          action={
            <Link href={`/attendance/view?date=${date}`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="size-4" strokeWidth={1.9} />
                เปลี่ยนกลุ่ม
              </Button>
            </Link>
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
        <div className="flex flex-wrap gap-2 border-t border-border/60 px-4 py-3 sm:px-5">
          <SlotChip label="เช้า" present={section.morningPresent} total={section.studentCount} />
          <SlotChip label="บ่าย" present={section.afternoonPresent} total={section.studentCount} />
          <span className="ml-auto flex flex-wrap gap-2">
            <Link href={`/attendance?date=${date}&section=${sectionId}`}>
              <Button variant="secondary" size="sm">
                <ClipboardCheck className="size-4" strokeWidth={1.8} />
                ไปแก้ไขการเช็คชื่อ
              </Button>
            </Link>
            <Link href={`/attendance/view?section=${sectionId}`}>
              <Button variant="outline" size="sm">
                <Table2 className="size-4" strokeWidth={1.8} />
                สรุปทั้งปีของกลุ่มนี้
              </Button>
            </Link>
          </span>
        </div>
      </Card>

      {roster.length === 0 ? (
        <EmptyState
          title="ยังไม่มีนักเรียนในกลุ่มนี้"
          hint="จัดนักเรียนเข้าวิชาก่อนที่หน้า “จัดนักเรียนเข้าวิชา”"
        />
      ) : (
        <Card>
          <CardHeader
            icon={<Users className="size-4.5" strokeWidth={1.8} />}
            title={`รายชื่อนักเรียน ${roster.length} คน`}
            action={
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="accent">ยอดเยี่ยม {outcomes.excellent}</Badge>
                <Badge tone="success">ผ่าน {outcomes.partial}</Badge>
                <Badge tone="destructive">ไม่ผ่าน {outcomes.absent}</Badge>
                {outcomes.pending > 0 ? (
                  <Badge tone="secondary">ยังไม่เช็ค {outcomes.pending}</Badge>
                ) : null}
              </div>
            }
          />
          {/*
            Six columns need 520px, which a phone has not got — so below sm the
            same rows are a list instead, the way the เช็คชื่อ screen already
            does it. Reading one day's roster should never mean dragging the
            page sideways.
          */}
          <ul className="divide-y divide-border/60 border-t border-border/60 sm:hidden">
            {roster.map((e) => (
              <RosterCard key={e.studentId} entry={e} />
            ))}
          </ul>
          <div className="hidden overflow-x-auto overscroll-x-contain sm:block">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="w-10 py-2 pl-4 pr-1 text-center font-medium">ที่</th>
                  <th className="w-12 px-1 py-2 text-center font-medium">เลขที่</th>
                  <th className="px-3 py-2 text-left font-medium">นักเรียน</th>
                  <th className="px-2 py-2 text-center font-medium">เช้า</th>
                  <th className="px-2 py-2 text-center font-medium">บ่าย</th>
                  <th className="px-3 py-2 text-center font-medium">ผลของวัน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {roster.map((e, i) => (
                  <RosterRow key={e.studentId} entry={e} index={i} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border/60 px-4 py-3 text-xs text-muted-foreground sm:px-5">
            มาแค่เช้าหรือบ่าย = ผ่าน · มาครบทั้งวัน = ยอดเยี่ยม · ไม่มาเลย = ไม่ผ่าน
          </div>
        </Card>
      )}
    </div>
  );
}

/** The same student on a phone: name on top, both slots on a second line. */
function RosterCard({ entry: e }: { entry: DayRosterEntry }) {
  const pending = e.morning === null && e.afternoon === null;
  const result: DayResult = dayOutcome(e.morning, e.afternoon);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-sm font-semibold text-secondary-foreground tabular-nums"
        title="เลขที่ในห้องเรียน"
      >
        {e.classNumber ?? <span className="text-muted-foreground">—</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {e.fullName}
          {e.nickname ? <span className="font-normal text-muted-foreground"> ({e.nickname})</span> : null}
        </span>
        <span className="block truncate text-xs text-muted-foreground tabular-nums">
          {e.code} · {e.gradeLevel}/{e.classroom}
        </span>
      </span>
      <span className="shrink-0">
        {pending ? (
          <span className="text-xs text-muted-foreground">ยังไม่เช็ค</span>
        ) : (
          <Badge tone={result === 'excellent' ? 'accent' : result === 'partial' ? 'success' : 'destructive'}>
            {DAY_OUTCOME_LABEL[result]}
          </Badge>
        )}
      </span>
      <span className="flex basis-full items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          เช้า <PresenceCell value={e.morning} />
        </span>
        <span className="flex items-center gap-1.5">
          บ่าย <PresenceCell value={e.afternoon} />
        </span>
      </span>
    </li>
  );
}

function RosterRow({ entry: e, index }: { entry: DayRosterEntry; index: number }) {
  const pending = e.morning === null && e.afternoon === null;
  const result: DayResult = dayOutcome(e.morning, e.afternoon);
  return (
    <tr className="hover:bg-secondary/40">
      <td className="py-2 pl-4 pr-1 text-center text-xs text-muted-foreground tabular-nums">
        {index + 1}
      </td>
      <td className="px-1 py-2 text-center font-medium tabular-nums">
        {e.classNumber ?? <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-3 py-2">
        <p className="truncate font-medium">
          {e.fullName}
          {e.nickname ? <span className="font-normal text-muted-foreground"> ({e.nickname})</span> : null}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {e.code} · {e.gradeLevel}/{e.classroom}
        </p>
      </td>
      <td className="px-2 py-2 text-center">
        <PresenceCell value={e.morning} />
      </td>
      <td className="px-2 py-2 text-center">
        <PresenceCell value={e.afternoon} />
      </td>
      <td className="px-3 py-2 text-center">
        {pending ? (
          <span className="text-xs text-muted-foreground">ยังไม่เช็ค</span>
        ) : (
          <Badge tone={result === 'excellent' ? 'accent' : result === 'partial' ? 'success' : 'destructive'}>
            {DAY_OUTCOME_LABEL[result]}
          </Badge>
        )}
      </td>
    </tr>
  );
}

function PresenceCell({ value }: { value: boolean | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">—</span>;
  return <Badge tone={value ? 'success' : 'destructive'}>{value ? 'มา' : 'ขาด'}</Badge>;
}

/* ── The whole year for one กลุ่ม — the matrix behind “สรุปทั้งปี” ───────── */

export async function TermSummary({ year, sectionId }: { year: YearRow; sectionId: number }) {
  const sections = await listSections(year.id);
  if (sections.length === 0)
    return (
      <EmptyState
        icon={<Eye className="size-8" strokeWidth={1.5} />}
        title="ยังไม่มีกลุ่มเรียน"
        hint="จัดนักเรียนเข้าวิชาก่อน"
      />
    );

  const section = sections.find((s) => s.id === sectionId) ?? sections[0];
  const [rows, dates] = await Promise.all([evaluateAll(section.id), classDatesOf(section.id)]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/attendance/view">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-4" strokeWidth={1.9} />
            กลับไปดูรายวัน
          </Button>
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
          <SectionSwitcher sections={sections} current={section.id} />
          <Link href={`/attendance/print?section=${section.id}`}>
            <Button variant="secondary" size="md">
              <Printer className="size-4.5" strokeWidth={1.8} /> พิมพ์
            </Button>
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="ยังไม่มีนักเรียนในกลุ่มนี้"
          hint="จัดนักเรียนเข้าวิชาก่อนที่หน้า “จัดนักเรียนเข้าวิชา”"
        />
      ) : (
        <Card>
          <CardHeader
            icon={<Table2 className="size-4.5" strokeWidth={1.8} />}
            title={`${section.subjectCode} — ${section.subjectName} · ${section.name}`}
            action={
              <Badge tone="navy">
                {rows.length} คน · {dates.length} วันที่เรียน
              </Badge>
            }
          />
          <div className="overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="sticky left-0 z-10 bg-card px-4 py-2.5 text-left font-medium">นักเรียน</th>
                  {dates.map((d) => (
                    <th key={d} className="px-1.5 py-2.5 text-center font-medium">
                      <div>{thaiDateShort(d)}</div>
                      <div className="text-[10px] text-muted-foreground/70">
                        {THAI_WEEKDAYS_SHORT[weekdayOfYmd(d)]}
                      </div>
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-center font-medium">สรุป</th>
                  <th className="px-3 py-2.5 text-center font-medium">ผล</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map(({ student, evaluation }) => {
                  const byDate = new Map(evaluation.days.map((d) => [d.date, d]));
                  return (
                    <tr key={student.id} className="hover:bg-secondary/40">
                      <td className="sticky left-0 z-10 bg-card px-4 py-2 hover:bg-secondary/40">
                        <p className="truncate font-medium">{student.fullName}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">{student.code}</p>
                      </td>
                      {dates.map((d) => {
                        const day = byDate.get(d);
                        return (
                          <td
                            key={d}
                            className="px-1.5 py-2 text-center"
                            title={day ? DAY_RESULT_LABEL[day.result] : 'ยังไม่เช็ค'}
                          >
                            <div className="flex justify-center gap-0.5">
                              <SlotDot value={day?.morning ?? null} />
                              <SlotDot value={day?.afternoon ?? null} />
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center text-xs text-muted-foreground tabular-nums">
                        {evaluation.counts.excellent}/{evaluation.counts.partial}/
                        {evaluation.counts.absent}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge tone={resultTone(evaluation.overall)}>
                          {OVERALL_LABEL[evaluation.overall]}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-4 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <SlotDot value={true} /> มา
            </span>
            <span className="flex items-center gap-1.5">
              <SlotDot value={false} /> ขาด
            </span>
            <span className="flex items-center gap-1.5">
              <SlotDot value={null} /> ยังไม่เช็ค / ไม่มีคาบ
            </span>
            <span>· สรุป = ยอดเยี่ยม/ครึ่งวัน/ขาด</span>
          </div>
        </Card>
      )}
    </div>
  );
}

function SlotDot({ value }: { value: boolean | null }) {
  const cls = value === true ? 'bg-success' : value === false ? 'bg-destructive' : 'bg-border';
  return <span className={`inline-block size-2.5 rounded-full ${cls}`} />;
}
