import { requireRole } from '@/lib/authz';
import {
  isSchoolOsAdmin,
  listAdminGrants,
  listSchoolOsAdmins,
  listTeachers,
} from '@/lib/admin-grants';
import { PermissionsManager } from './permissions-manager';

export const metadata = { title: 'สิทธิ์ผู้ดูแล' };

export default async function PermissionsPage() {
  const user = await requireRole('admin');
  const [grants, teachers, schoolosAdmins] = await Promise.all([
    listAdminGrants(),
    listTeachers(),
    listSchoolOsAdmins(),
  ]);

  // A grant on someone who is already teacher-admin upstream would be a no-op,
  // so they never appear in the picker — they get their own read-only list.
  const candidates = teachers.filter((t) => !isSchoolOsAdmin(t.schoolosRole));

  return (
    <PermissionsManager
      grants={grants.map((g) => ({
        personId: g.personId,
        code: g.code,
        fullName: g.fullName,
        status: g.status,
        note: g.note,
        grantedByName: g.grantedByName,
        createdAt: g.createdAt,
      }))}
      candidates={candidates.map((t) => ({
        id: t.id,
        code: t.code,
        fullName: t.fullName,
        status: t.status,
      }))}
      schoolosAdmins={schoolosAdmins.map((t) => ({
        id: t.id,
        code: t.code,
        fullName: t.fullName,
        status: t.status,
      }))}
      selfPersonId={user.personId ?? null}
    />
  );
}
