import { requireCatalogEditor } from '@/lib/authz';
import { activeYear } from '@/lib/years';
import { AppShell } from '@/components/app-shell';
import { photoUrlOf } from '@/lib/session';
import { ssoConfig } from '@/lib/sso';

/**
 * วิชาเสริม and ตารางเรียนทั้งปี — the two /admin screens a moderator shares
 * with the ผู้ดูแล. Every other /admin screen sits under (admin), whose layout
 * still admits the ผู้ดูแล alone; this group is kept apart so loosening its
 * gate cannot loosen theirs.
 *
 * The shell follows the user's own role, so a moderator keeps the ครู menu
 * (plus these two links) rather than landing in a ผู้ดูแล sidebar full of
 * screens that would turn them away.
 */
export default async function CatalogLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCatalogEditor();
  const year = await activeYear();
  return (
    <AppShell
      role={user.role}
      moderator={user.moderator}
      name={user.name}
      firstName={user.firstName}
      photoUrl={photoUrlOf(user)}
      yearLabel={year ? `ปีการศึกษา ${year.year}` : 'ยังไม่ได้ซิงก์ปีการศึกษา'}
      sso={ssoConfig()}
      via={user.via}
      ssoSub={user.ssoSub}
      client={user.client}
    >
      {children}
    </AppShell>
  );
}
