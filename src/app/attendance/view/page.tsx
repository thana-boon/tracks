import { requireRole } from '@/lib/authz';
import { activeYear } from '@/lib/years';
import { NeedYear } from '@/components/ui';
import { normalizeYmd, todayYmd } from '@/lib/utils';
import { DayList, DayDetail, SectionsOnDay, TermSummary } from './views';
import type { DayStatus } from './day-filter';

export const metadata = { title: 'ผลเช็คชื่อ' };

/**
 * ผลเช็คชื่อ — ผู้ดูแลระบบเท่านั้น (ครูเช็คชื่อได้ แต่ดูภาพรวมทั้งโรงเรียนไม่ได้).
 *
 * The screen is a drill-down held entirely in the URL, so any step can be
 * linked to or refreshed:
 *   (no params)      วันเรียนทั้งปี พร้อมสถานะว่าเช็คครบหรือยัง
 *   ?date            กลุ่มเรียนของวันนั้น + ปุ่มไปดูรายละเอียด / ไปเช็คชื่อ
 *   ?date&section    รายชื่อนักเรียนของกลุ่มนั้นในวันนั้น
 *   ?section         สรุปทั้งปีของกลุ่มนั้น (ตารางเดิม)
 */
export default async function AttendanceViewPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; section?: string; month?: string; status?: string }>;
}) {
  await requireRole('admin');
  const year = await activeYear();
  if (!year) return <NeedYear />;

  const sp = await searchParams;
  const date = normalizeYmd(sp.date);
  const sectionId = Number(sp.section) > 0 ? Number(sp.section) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ผลเช็คชื่อ</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          เลือกวัน → ดูว่าวันนั้นมีวิชาอะไรและเช็คชื่อครบหรือยัง → กดดูรายละเอียดหรือไปเช็คชื่อ · ปีการศึกษา{' '}
          {year.year}
        </p>
      </div>

      {date && sectionId ? (
        <DayDetail year={year} date={date} sectionId={sectionId} />
      ) : date ? (
        <SectionsOnDay year={year} date={date} />
      ) : sectionId ? (
        <TermSummary year={year} sectionId={sectionId} />
      ) : (
        <DayList
          year={year}
          today={todayYmd()}
          month={sp.month}
          status={sp.status as DayStatus | undefined}
        />
      )}
    </div>
  );
}
