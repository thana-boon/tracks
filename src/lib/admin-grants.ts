import 'server-only';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { adminGrants, people } from '@/db/schema';

/**
 * สิทธิ์ผู้ดูแลของระบบนี้ — admin granted *here*, to a teacher who is a plain
 * `teacher` in the Users Service.
 *
 * The rule that makes this safe to hand to a school: this table only ever ADDS
 * admin. It never writes to the Users Service and never subtracts from it, so a
 * `teacher-admin` upstream stays an admin here whatever this table says, and
 * revoking a grant can only take away what this table gave. That is what keeps
 * the two sources of admin from fighting each other.
 */

/** Teachers whose SchoolOS role already makes them admin — grants are moot. */
export function isSchoolOsAdmin(schoolosRole: string | null | undefined): boolean {
  return schoolosRole === 'teacher-admin';
}

/** Does this person hold a local admin grant? */
export async function hasAdminGrant(personId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: adminGrants.id })
    .from(adminGrants)
    .where(eq(adminGrants.personId, personId))
    .limit(1);
  return Boolean(row);
}

/**
 * The role a person session should actually run as, re-read from the database
 * rather than trusted from the JWT. A grant added (or pulled) while someone is
 * logged in takes effect on their next page load — waiting up to 12 hours for a
 * session to expire is not an acceptable way to remove admin.
 *
 * Students are never affected: this system's admin is a teacher thing.
 */
export async function effectiveTeacherRole(personId: number): Promise<'admin' | 'teacher' | null> {
  const [row] = await db
    .select({ type: people.type, schoolosRole: people.schoolosRole })
    .from(people)
    .where(eq(people.id, personId))
    .limit(1);
  if (!row || row.type !== 'teacher') return null;
  if (isSchoolOsAdmin(row.schoolosRole)) return 'admin';
  return (await hasAdminGrant(personId)) ? 'admin' : 'teacher';
}

export interface AdminGrantRow {
  personId: number;
  code: string;
  fullName: string;
  schoolosRole: string | null;
  status: string;
  note: string | null;
  grantedByName: string;
  createdAt: Date;
}

/** Everyone holding a grant, newest first — the list the สิทธิ์ page manages. */
export async function listAdminGrants(): Promise<AdminGrantRow[]> {
  return db
    .select({
      personId: adminGrants.personId,
      code: people.code,
      fullName: people.fullName,
      schoolosRole: people.schoolosRole,
      status: people.status,
      note: adminGrants.note,
      grantedByName: adminGrants.grantedByName,
      createdAt: adminGrants.createdAt,
    })
    .from(adminGrants)
    .innerJoin(people, eq(adminGrants.personId, people.id))
    .orderBy(desc(adminGrants.createdAt));
}

export interface TeacherRow {
  id: number;
  code: string;
  fullName: string;
  schoolosRole: string | null;
  status: string;
}

/** Every synced teacher — the pool the grant picker searches. */
export async function listTeachers(): Promise<TeacherRow[]> {
  return db
    .select({
      id: people.id,
      code: people.code,
      fullName: people.fullName,
      schoolosRole: people.schoolosRole,
      status: people.status,
    })
    .from(people)
    .where(eq(people.type, 'teacher'))
    .orderBy(asc(people.fullName));
}

/** Teachers who are admin because the Users Service says so — read-only here. */
export async function listSchoolOsAdmins(): Promise<TeacherRow[]> {
  return db
    .select({
      id: people.id,
      code: people.code,
      fullName: people.fullName,
      schoolosRole: people.schoolosRole,
      status: people.status,
    })
    .from(people)
    .where(and(eq(people.type, 'teacher'), eq(people.schoolosRole, 'teacher-admin')))
    .orderBy(asc(people.fullName));
}

/** Names for a set of person ids — used when logging a grant/revoke. */
export async function namesOf(personIds: number[]): Promise<Map<number, string>> {
  if (personIds.length === 0) return new Map();
  const rows = await db
    .select({ id: people.id, fullName: people.fullName })
    .from(people)
    .where(inArray(people.id, personIds));
  return new Map(rows.map((r) => [r.id, r.fullName]));
}
