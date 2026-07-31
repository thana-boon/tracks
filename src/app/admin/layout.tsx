import { requireRole } from '@/lib/authz';
import { activeYear } from '@/lib/years';
import { AppShell } from '@/components/app-shell';
import { photoUrlOf } from '@/lib/session';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole('admin');
  const year = await activeYear();
  return (
    <AppShell
      role="admin"
      name={user.name}
      firstName={user.firstName}
      photoUrl={photoUrlOf(user)}
      yearLabel={year ? `ปีการศึกษา ${year.year}` : 'ยังไม่ได้ซิงก์ปีการศึกษา'}
    >
      {children}
    </AppShell>
  );
}
