import { requireRole } from '@/lib/authz';
import { activeYear } from '@/lib/years';
import { AppShell } from '@/components/app-shell';

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole('teacher');
  const year = await activeYear();
  return (
    <AppShell
      role="teacher"
      name={user.name}
      yearLabel={year ? `ปีการศึกษา ${year.year}` : 'ยังไม่ได้ซิงก์ปีการศึกษา'}
    >
      {children}
    </AppShell>
  );
}
