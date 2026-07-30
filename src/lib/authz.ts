import 'server-only';
import { redirect } from 'next/navigation';
import { getSession, type AppRole, type SessionUser } from './session';

/** Require a logged-in session; redirect to /login otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect('/login');
  return user;
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
