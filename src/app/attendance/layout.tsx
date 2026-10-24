import { RoleShell } from '@/components/role-shell';
import { requireAttendanceTaker } from '@/lib/authz';

/**
 * ผู้ดูแล and moderators only. Teachers take attendance in another system now,
 * so any other ครู who follows an old bookmark here is sent back to their own
 * dashboard. ผลเช็คชื่อ and พิมพ์ใบเช็คชื่อ narrow this further, to ผู้ดูแล.
 */
export default async function AttendanceLayout({ children }: { children: React.ReactNode }) {
  await requireAttendanceTaker();
  return <RoleShell allow={['admin', 'teacher']}>{children}</RoleShell>;
}
