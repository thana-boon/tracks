import { activeYear } from '@/lib/years';
import { subjectsForCheckIn } from '@/lib/subjects-for-user';
import { todayYmd } from '@/lib/utils';
import { NeedYear } from '@/components/ui';
import { CheckIn } from './check-in';

export const metadata = { title: 'เช็คชื่อ · Track' };

export default async function AttendancePage() {
  const year = await activeYear();
  if (!year) return <NeedYear />;
  const subjects = await subjectsForCheckIn(year);
  return <CheckIn subjects={subjects} today={todayYmd()} />;
}
