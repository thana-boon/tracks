import { activeYear } from '@/lib/years';
import { classDaysOfYear, sectionsOnDate, type SectionOnDay } from '@/lib/subjects-for-user';
import { normalizeYmd, todayYmd } from '@/lib/utils';
import { NeedYear } from '@/components/ui';
import { CheckIn } from './check-in';

export const metadata = { title: 'เช็คชื่อ' };

/**
 * `?date=` and `?section=` jump straight to a step of the flow — the ผลเช็คชื่อ
 * screen links here with both when an admin spots a กลุ่ม that is still unchecked.
 *
 * With no `?date=`, the screen opens on today whenever today is a class day:
 * that is what a teacher is here for almost every time, and it keeps the day
 * picker out of the way of the common case as the year fills up with dates.
 * Picking the day is still one press away behind เปลี่ยนวัน.
 */
export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; section?: string }>;
}) {
  const year = await activeYear();
  if (!year) return <NeedYear />;
  const days = await classDaysOfYear(year);

  const sp = await searchParams;
  const today = todayYmd();
  const asked = normalizeYmd(sp.date);
  const date =
    asked && days.some((d) => d.date === asked)
      ? asked
      : days.some((d) => d.date === today)
        ? today
        : null;

  let section: SectionOnDay | null = null;
  if (date && sp.section) {
    const sections = await sectionsOnDate(year, date);
    section = sections.find((s) => s.id === Number(sp.section)) ?? null;
  }

  return <CheckIn days={days} today={today} startDate={date} startSection={section} />;
}
