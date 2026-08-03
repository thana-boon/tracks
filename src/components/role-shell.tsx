import { requireRole } from '@/lib/authz';
import { activeYear } from '@/lib/years';
import { AppShell } from '@/components/app-shell';
import { photoUrlOf, type AppRole } from '@/lib/session';
import { ssoConfig } from '@/lib/sso';

/**
 * Wraps a page in the app shell for whichever of the given roles the current
 * user holds — used by routes shared between admin and teacher (attendance,
 * results). The sidebar/nav follows the user's own role.
 */
export async function RoleShell({
  allow,
  children,
}: {
  allow: AppRole[];
  children: React.ReactNode;
}) {
  const user = await requireRole(...allow);
  const year = await activeYear();
  return (
    <AppShell
      role={user.role}
      name={user.name}
      firstName={user.firstName}
      photoUrl={photoUrlOf(user)}
      yearLabel={year ? `ปีการศึกษา ${year.year}` : 'ยังไม่ได้ซิงก์ปีการศึกษา'}
      sso={ssoConfig()}
      via={user.via}
      ssoSub={user.ssoSub}
    >
      {children}
    </AppShell>
  );
}
