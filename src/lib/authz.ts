import 'server-only';
import { redirect } from 'next/navigation';
import { getSession, type AppRole, type SessionUser } from './session';
import { effectiveTeacherRole } from './admin-grants';

/**
 * Re-resolve a teacher session's role against the database.
 *
 * The JWT carries the role it was minted with, but admin here can also come
 * from a local grant (หน้าสิทธิ์) that an admin adds or pulls at any time. Any
 * page load re-reads it, so a grant applies — and a revoke bites — without
 * waiting for a 12-hour session to expire. Local admins and students skip the
 * query: neither can be changed by a grant.
 */
async function withEffectiveRole(user: SessionUser): Promise<SessionUser> {
  if (user.adminId || user.role === 'student' || !user.personId) return user;
  try {
    const role = await effectiveTeacherRole(user.personId);
    return role && role !== user.role ? { ...user, role } : user;
  } catch {
    // A momentarily unreachable DB must not log everyone out; the JWT's own
    // role is the safe fallback — it can only be as broad as it was at login.
    return user;
  }
}

/** Require a logged-in session; redirect to /login otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect('/login');
  return withEffectiveRole(user);
}

/**
 * The current session with its role re-resolved, or null — for API routes,
 * which answer with a status code rather than redirecting.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const user = await getSession();
  return user ? withEffectiveRole(user) : null;
}

/** Require one of the given roles; redirect to the caller's own dashboard otherwise. */
export async function requireRole(...roles: AppRole[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect(dashboardPath(user.role));
  return user;
}

export function dashboardPath(role: AppRole): string {
  switch (role) {
    case 'admin':
      return '/admin';
    case 'teacher':
      return '/teacher';
    case 'student':
      return '/student';
  }
}

/** Audit actor string for the current user. */
export function actorOf(user: SessionUser): string {
  if (user.adminId) return `admin:${user.adminId}`;
  return `${user.role}:person:${user.personId}`;
}
