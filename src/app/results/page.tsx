import Link from 'next/link';
import { CalendarCheck, Users, BookOpen } from 'lucide-react';
import { requireRole } from '@/lib/authz';
import { activeYear } from '@/lib/years';
import {
  buildHomeroomReport,
  listHomerooms,
  studentsByRoom,
  summarizeAttendance,
  type AttendanceRow,
} from '@/lib/homeroom';
import { NeedYear, Card, CardHeader, Badge, EmptyState } from '@/components/ui';
import { RoomSwitcher } from '@/components/room-switcher';
import { PASS_MIN_RATIO } from '@/lib/evaluate';

export const metadata = { title: 'เวลาเข้าเรียน' };

/**
 * เวลาเข้าเรียน — read by ห้องหลัก (the student's own homeroom), not by รอบเรียน.
 *
 * The question this answers is "นักเรียนห้องนี้มาเรียนกี่ครั้ง ขาดกี่ครั้ง", so a
 * row is a student and the counts span every วิชาเสริม they sit. A ครูประจำชั้น
 * sees the room(s) they advise and nothing else; an admin can page through every
 * room. Read-only either way — the numbers come from เช็คชื่อ.
 *
 * The per-รอบเรียน view of the same data stays at /results/subject, for whoever
 * is looking at one วิชา rather than one ห้อง.
 */
export default async function AttendanceTimePage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const user = await requireRole('admin', 'teacher');
  const year = await activeYear();
  if (!year) return <NeedYear />;

  const isAdmin = user.role === 'admin';
  if (!isAdmin && !user.personId)
    return (
      <div className="space-y-6">
        <Header isAdmin={isAdmin} />
        <EmptyState title="ไม่พบข้อมูลครู" hint="ต้องซิงก์รายชื่อครูก่อน — ติดต่อผู้ดูแล" />
      </div>
    );

  const rooms = await listHomerooms(year, isAdmin ? undefined : user.personId!);
  if (rooms.length === 0)
    return (
      <div className="space-y-6">
        <Header isAdmin={isAdmin} />
        <EmptyState
          icon={<Users className="size-8" strokeWidth={1.5} />}
          title={isAdmin ? 'ยังไม่มีห้องที่ปรึกษาในปีนี้' : 'คุณยังไม่ได้เป็นครูที่ปรึกษาห้องใด'}
          hint={
            isAdmin
              ? 'ห้องมาจากการซิงก์ครูที่ปรึกษา — ระบบซิงก์ให้อัตโนมัติ ดูสถานะได้ที่หน้าซิงก์รายชื่อ'
              : 'หน้านี้แสดงเวลาเข้าเรียนของห้องที่คุณเป็นครูที่ปรึกษา — หากคิดว่าผิดพลาด ติดต่อผู้ดูแล'
          }
        />
      </div>
    );

  const sp = await searchParams;
  const viewing = rooms.find((r) => r.key === sp.room?.trim()) ?? rooms[0];

  const byRoom = await studentsByRoom([viewing]);
  const rows = summarizeAttendance(
    await buildHomeroomReport(year, byRoom.get(viewing.key) ?? []),
  );

  // Room totals, so "ห้องนี้เป็นอย่างไร" is answered before reading any row.
  const totals = rows.reduce(
    (a, r) => ({
      attended: a.attended + r.full + r.partial,
      absent: a.absent + r.absent,
    }),
    { attended: 0, absent: 0 },
  );
  const withClasses = rows.filter((r) => r.lines.length > 0).length;
  const below = rows.filter((r) => r.held > 0 && r.attendedRatio < PASS_MIN_RATIO).length;

  return (
    <div className="space-y-6">
      <Header isAdmin={isAdmin} />

      {rooms.length > 1 ? (
        <RoomSwitcher
          rooms={rooms}
          current={viewing.key}
          basePath="/results"
          title={isAdmin ? 'เลือกห้องที่จะดู' : 'ห้องที่ปรึกษาของคุณ'}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="ลงวิชาเสริมแล้ว" value={`${withClasses}/${rows.length}`} />
        <Tile label="มาเรียน (ครั้ง)" value={totals.attended} tone="success" />
        <Tile label="ขาด (ครั้ง)" value={totals.absent} tone="destructive" />
        <Tile label={`เข้าเรียนต่ำกว่า ${Math.round(PASS_MIN_RATIO * 100)}%`} value={below} tone="accent" />
      </div>

      <Card>
        <CardHeader
          icon={<CalendarCheck className="size-4.5" strokeWidth={1.8} />}
          title={`ห้อง ${viewing.key}`}
          action={
            <div className="flex items-center gap-2">
              {viewing.teacherNames.length > 0 ? (
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  ครูที่ปรึกษา {viewing.teacherNames.join(', ')}
                </span>
              ) : null}
              <Badge tone="navy">{rows.length} คน</Badge>
            </div>
          }
        />
        {rows.length === 0 ? (
          <div className="px-4 pb-5 sm:px-5">
            <EmptyState
              title="ไม่มีนักเรียนในห้องนี้"
              hint="รายชื่อนักเรียนมาจากการซิงก์จาก SchoolOS"
            />
          </div>
        ) : (
          <>
          {/*
            Eight columns will not go on a phone. Below sm the same numbers are
            a list — เข้าเรียน% first, since that is what the row is read for.
          */}
          <ul className="divide-y divide-border/60 border-t border-border/60 sm:hidden">
            {rows.map((r) => (
              <StudentCard key={r.student.id} row={r} />
            ))}
          </ul>
          <div className="hidden overflow-x-auto overscroll-x-contain sm:block">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="w-12 px-3 py-2.5 text-center font-medium">เลขที่</th>
                  <th className="px-4 py-2.5 text-left font-medium">นักเรียน · วิชาเสริมที่ลง</th>
                  <th className="px-3 py-2.5 text-center font-medium">มาเต็มวัน</th>
                  <th className="px-3 py-2.5 text-center font-medium">มาครึ่งวัน</th>
                  <th className="px-3 py-2.5 text-center font-medium">ขาด</th>
                  <th className="px-3 py-2.5 text-center font-medium">รอเช็ค</th>
                  <th className="px-3 py-2.5 text-center font-medium">วันเรียน</th>
                  <th className="px-3 py-2.5 text-center font-medium">เข้าเรียน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map((r) => (
                  <StudentRow key={r.student.id} row={r} />
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        นับจากการเช็คชื่อจริง — วันที่ครูยังไม่ได้เช็คขึ้นเป็น “รอเช็ค” ไม่นับเป็นการขาด
        {isAdmin ? (
          <>
            {' · ต้องการดูเป็นรายวิชา/รอบเรียน ไปที่ '}
            <Link href="/results/subject" className="font-medium text-primary hover:underline">
              ผลรายวิชา
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}

/** One student: who they are, what they sit, and how often they turned up. */
function StudentRow({ row }: { row: AttendanceRow }) {
  const s = row.student;
  const low = row.held > 0 && row.attendedRatio < PASS_MIN_RATIO;
  return (
    <tr className="hover:bg-secondary/40">
      <td className="px-3 py-2 text-center text-xs text-muted-foreground tabular-nums">
        {s.classNumber ?? '—'}
      </td>
      <td className="px-4 py-2">
        <p className="truncate font-medium">{s.fullName}</p>
        <SubjectChips lines={row.lines} className="mt-0.5" />
      </td>
      <td className="px-3 py-2 text-center tabular-nums text-success">{row.full}</td>
      <td className="px-3 py-2 text-center tabular-nums text-[#8a6a00]">{row.partial}</td>
      <td className="px-3 py-2 text-center tabular-nums text-destructive">{row.absent}</td>
      <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">
        {row.pending || '—'}
      </td>
      <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">{row.held}</td>
      <td className="px-3 py-2 text-center">
        {row.held === 0 ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <Badge tone={low ? 'destructive' : 'success'}>
            {Math.round(row.attendedRatio * 100)}%
          </Badge>
        )}
      </td>
    </tr>
  );
}

/** วิชาเสริมที่ลง กับสัดส่วนการมาของแต่ละวิชา — shared by the row and the card. */
function SubjectChips({
  lines,
  className,
}: {
  lines: AttendanceRow['lines'];
  className?: string;
}) {
  if (lines.length === 0)
    return <p className={`text-xs text-muted-foreground ${className ?? ''}`}>ยังไม่ได้ลงวิชาเสริม</p>;
  return (
    <div className={`flex flex-wrap gap-1 ${className ?? ''}`}>
      {lines.map((l) => (
        <span
          key={`${l.subjectCode}·${l.sectionName}`}
          title={`${l.subjectName} · ${l.sectionName}`}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground"
        >
          <BookOpen className="size-3" strokeWidth={2} />
          <span className="font-medium text-foreground">{l.subjectCode}</span>
          <span className="tabular-nums">
            {l.held === 0 ? 'ยังไม่เช็ค' : `${l.full + l.partial}/${l.held}`}
          </span>
        </span>
      ))}
    </div>
  );
}

/** The same student on a phone — เข้าเรียน% up top, the counts on one line. */
function StudentCard({ row }: { row: AttendanceRow }) {
  const s = row.student;
  const low = row.held > 0 && row.attendedRatio < PASS_MIN_RATIO;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-sm font-semibold text-secondary-foreground tabular-nums"
        title="เลขที่ในห้องเรียน"
      >
        {s.classNumber ?? <span className="text-muted-foreground">—</span>}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.fullName}</span>
      <span className="shrink-0">
        {row.held === 0 ? (
          <span className="text-xs text-muted-foreground">ยังไม่มีวันเรียน</span>
        ) : (
          <Badge tone={low ? 'destructive' : 'success'}>
            {Math.round(row.attendedRatio * 100)}%
          </Badge>
        )}
      </span>
      <span className="flex basis-full flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums text-muted-foreground">
        <span className="text-success">เต็มวัน {row.full}</span>
        <span className="text-[#8a6a00]">ครึ่งวัน {row.partial}</span>
        <span className="text-destructive">ขาด {row.absent}</span>
        {row.pending > 0 ? <span>รอเช็ค {row.pending}</span> : null}
        <span>จาก {row.held} วันเรียน</span>
      </span>
      <SubjectChips lines={row.lines} className="basis-full" />
    </li>
  );
}

function Header({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">เวลาเข้าเรียน</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {isAdmin
          ? 'ดูตามห้องหลักของนักเรียน — เปลี่ยนห้องได้ทุกห้อง นับรวมทุกวิชาเสริมที่นักเรียนลงไว้'
          : 'ห้องที่ปรึกษาของคุณ — นักเรียนแต่ละคนมาเรียนกี่ครั้ง ขาดกี่ครั้ง รวมทุกวิชาเสริม'}
      </p>
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
  tone?: 'accent' | 'success' | 'destructive' | 'secondary';
}) {
  const ring: Record<string, string> = {
    accent: 'text-[#8a6a00]',
    success: 'text-success',
    destructive: 'text-destructive',
    secondary: 'text-foreground',
  };
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${ring[tone]}`}>
        {typeof value === 'number' ? value.toLocaleString('th-TH') : value}
      </p>
    </Card>
  );
}
