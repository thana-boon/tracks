import 'server-only';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { people } from '@/db/schema';
import { getSession, type AppRole, type SessionUser } from './session';
import { grantRoleOf, isSchoolOsAdmin } from './admin-grants';

/**
 * Statuses that end someone's access the moment the roster sync records them.
 *
 * Deliberately a denylist of the values this app knows (alumni.ts defines the
 * two student ones; teacher statuses are mirrored verbatim from the Users
 * Service). An allowlist would be tighter, but an unexpected upstream string
 * would then lock every teacher out of the school's own system — the wrong way
 * round to fail.
 */
const GONE: ReadonlySet<string> = new Set([
  'graduated',
  'withdrawn',
  'resigned',
  'retired',
  'terminated',
  'inactive',
  'suspended',
]);

/**
 * Re-resolve a person session against the database.
 *
 * Two things the JWT cannot be trusted for, both re-read on every page load:
 *
 *  - the role. Admin here can come from a local grant (หน้าสิทธิ์) added or
 *    pulled at any time, so a grant applies — and a revoke bites — without
 *    waiting for the session to expire.
 *  - whether the account still exists at all. A student who has graduated or a
 *    teacher who has left otherwise kept full access until their token ran out.
 *
 * Returns null when the session should end. Local admins skip the query: they
 * are this app's own accounts, and neither a grant nor a roster sync touches
 * them.
 */
async function withEffectiveRole(user: SessionUser): Promise<SessionUser | null> {
  if (user.adminId) return user;
  if (!user.personId) return user;
  try {
    const [row] = await db
      .select({
        type: people.type,
        status: people.status,
        schoolosRole: people.schoolosRole,
      })
      .from(people)
      .where(eq(people.id, user.personId))
      .limit(1);
    if (!row || GONE.has(row.status)) return null;
    if (row.type !== 'teacher' || user.role === 'student') return user;

    const grant = isSchoolOsAdmin(row.schoolosRole) ? 'admin' : await grantRoleOf(user.personId);
    const role: AppRole = grant === 'admin' ? 'admin' : 'teacher';
    const moderator = grant === 'moderator';
    return role === user.role && moderator === Boolean(user.moderator)
      ? user
      : { ...user, role, moderator };
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
  const live = await withEffectiveRole(user);
  if (!live) redirect('/login?gone=1');
  return live;
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

/**
 * Whether this user may edit the catalogue screens — วิชาเสริม and
 * ตารางเรียนทั้งปี. Every ผู้ดูแล may; of the ครู, only a moderator.
 */
export function canEditCatalog(user: SessionUser): boolean {
  return user.role === 'admin' || (user.role === 'teacher' && Boolean(user.moderator));
}

/**
 * Require a user who may edit the catalogue — the guard for the two screens a
 * moderator shares with the ผู้ดูแล, and for every server action behind them.
 */
export async function requireCatalogEditor(): Promise<SessionUser> {
  const user = await requireUser();
  if (!canEditCatalog(user)) redirect(dashboardPath(user.role));
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
