import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { requireRole } from '@/lib/authz';
import { activeYear } from '@/lib/years';
import { listHomerooms } from '@/lib/homeroom';
import { classDaysOfYear } from '@/lib/subjects-for-user';
import { NeedYear, EmptyState } from '@/components/ui';
import { ExportPanel } from './export-panel';

export const metadata = { title: 'ออกรายงาน PDF' };

/**
 * The PDF export, on its own page.
 *
 * An admin exports across the school; a ครูประจำชั้น exports the ห้อง they
 * advise — same page, same panel, a room list narrowed to their own. The API
 * route enforces that narrowing again, since a URL can be typed.
 *
 * `?room=` pre-ticks the room the reader came from, which is the common case:
 * look at a ห้อง, press PDF, print that ห้อง.
 */
export default async function HomeroomReportPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const user = await requireRole('admin', 'teacher');
  const year = await activeYear();
  if (!year) return <NeedYear />;

  const isAdmin = user.role === 'admin';
  if (!isAdmin && !user.personId)
    return <EmptyState title="ไม่พบข้อมูลครู" hint="ต้องซิงก์รายชื่อครูก่อน — ติดต่อผู้ดูแล" />;

  const [rooms, classDays] = await Promise.all([
    listHomerooms(year, isAdmin ? undefined : user.personId!),
    classDaysOfYear(year),
  ]);
  const months = [...new Set(classDays.map((d) => d.date.slice(0, 7)))];

  const sp = await searchParams;
  const asked = rooms.find((r) => r.key === sp.room?.trim())?.key;
  // A ครู who arrives without ?room= gets every room they advise already ticked —
  // there is nothing else they could have meant. An admin starts from a blank
  // sheet; ticking the whole school for them would be the wrong default.
  const initial = asked ? [asked] : isAdmin ? [] : rooms.map((r) => r.key);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/homeroom"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" strokeWidth={1.8} />
          กลับไปห้องที่ปรึกษา
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">ออกรายงาน PDF</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          รายงานเวลาเข้าเรียนวิชาเสริมรายห้อง · ปีการศึกษา {year.year} —{' '}
          {isAdmin ? 'เลือกห้องได้หลายห้องในไฟล์เดียว' : 'ออกได้เฉพาะห้องที่คุณเป็นครูที่ปรึกษา'}
        </p>
      </div>

      {rooms.length === 0 ? (
        <EmptyState
          icon={<Users className="size-8" strokeWidth={1.5} />}
          title={isAdmin ? 'ยังไม่มีห้องที่ปรึกษาในปีนี้' : 'คุณยังไม่ได้เป็นครูที่ปรึกษาห้องใด'}
          hint="ห้องมาจากการซิงก์ครูที่ปรึกษา — ระบบซิงก์ให้อัตโนมัติ หากคิดว่าผิดพลาด ติดต่อผู้ดูแล"
        />
      ) : (
        <ExportPanel
          rooms={rooms.map((r) => ({
            key: r.key,
            gradeLevel: r.gradeLevel,
            teacherNames: r.teacherNames,
            studentCount: r.studentCount,
          }))}
          months={months}
          initial={initial}
        />
      )}
    </div>
  );
}
