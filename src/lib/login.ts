import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { admins, people } from '@/db/schema';
import { hashPassword, needsRehash, verifyPassword } from './password';
import { schoolos, SchoolOsError } from './schoolos';
import { hasAdminGrant } from './admin-grants';
import type { SessionUser } from './session';

export interface LoginOutcome {
  ok: boolean;
  user?: SessionUser;
  error?: string;
  status?: number;
}

/**
 * The one answer every rejected credential gets.
 *
 * The messages used to differ — "บัญชีผู้ดูแลไม่ถูกต้อง" for a disabled admin,
 * "รหัสผ่านไม่ถูกต้อง" once a username was known to exist — which told anyone
 * asking which usernames are real, and which of them is the ผู้ดูแล. A
 * disabled account and an unknown one are now indistinguishable from outside.
 */
const BAD_CREDENTIAL: LoginOutcome = {
  ok: false,
  error: 'รหัสผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง',
  status: 401,
};

/**
 * Verify a SchoolOS credential into a session user.
 *
 *  - teacher: the Users Service is authoritative for the role — `teacher-admin`
 *    enters this system as admin, plain `teacher` as teacher (spec §2). The
 *    person row is upserted from the verify payload so a teacher can log in
 *    before the roster sync has run.
 *  - student: requires a synced `people` row — this system only serves ม.4-6,
 *    and the sync (admin > รายชื่อ) is what scopes the roster to those grades.
 */
async function verifyPerson(
  type: 'teacher' | 'student',
  username: string,
  password: string,
): Promise<LoginOutcome> {
  let verify;
  try {
    verify = await schoolos.verify(type, username, password);
  } catch (e) {
    if (e instanceof SchoolOsError) {
      // A rejected credential is how this endpoint answers normally: HTTP 401
      // with `{valid:false, error:{code:'invalid_credentials'}}`. The client
      // turns every non-2xx into a throw, so these statuses have to be sorted
      // out here — reporting "เชื่อมต่อไม่สำเร็จ" for a mistyped password sends
      // people to check the network instead of their password.
      if (e.status === 429)
        return { ok: false, error: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่', status: 429 };
      if (e.status === 401) return BAD_CREDENTIAL;
      if (e.status === 403)
        return {
          ok: false,
          error: e.message || 'บัญชีถูกปิดใช้งาน / พ้นสภาพแล้ว',
          status: 403,
        };
      return { ok: false, error: 'เชื่อมต่อ SchoolOS ไม่สำเร็จ', status: 502 };
    }
    return { ok: false, error: 'เกิดข้อผิดพลาด', status: 500 };
  }

  if (!verify.valid || !verify.user) return BAD_CREDENTIAL;
  if (!verify.user.active)
    return { ok: false, error: 'บัญชีถูกปิดใช้งาน / พ้นสภาพแล้ว', status: 403 };

  if (type === 'teacher') {
    // Upsert a minimal person row from the verified identity, then refresh the
    // SchoolOS role on every login (a promotion to teacher-admin applies
    // immediately, without waiting for the next roster sync).
    const [existing] = await db
      .select({ id: people.id, fullName: people.fullName, firstName: people.firstName })
      .from(people)
      .where(and(eq(people.type, 'teacher'), eq(people.schoolosId, verify.user.id)))
      .limit(1);

    let personId: number;
    if (existing) {
      personId = existing.id;
      await db
        .update(people)
        .set({ schoolosRole: verify.user.role, status: verify.user.status, syncedAt: new Date() })
        .where(eq(people.id, personId));
    } else {
      const name = verify.user.name || username;
      const [inserted] = await db
        .insert(people)
        .values({
          type: 'teacher',
          schoolosId: verify.user.id,
          code: verify.user.code,
          firstName: name,
          lastName: '',
          fullName: name,
          schoolosRole: verify.user.role,
          status: verify.user.status,
        })
        .returning({ id: people.id });
      personId = inserted.id;
    }

    // Two independent ways to be an admin here: the Users Service says so, or
    // this school added a local grant on หน้าสิทธิ์. Neither can revoke the
    // other — the grant is additive by design.
    const role: 'admin' | 'teacher' =
      verify.user.role === 'teacher-admin' || (await hasAdminGrant(personId))
        ? 'admin'
        : 'teacher';
    return {
      ok: true,
      user: {
        sub: `person:${personId}`,
        role,
        name: verify.user.name || username,
        // The synced row is the only place ชื่อจริง is split out; before the
        // first sync the avatar falls back to stripping the คำนำหน้า itself.
        firstName: existing?.firstName,
        personId,
      },
    };
  }

  // student
  const [student] = await db
    .select({ id: people.id, fullName: people.fullName, firstName: people.firstName })
    .from(people)
    .where(and(eq(people.type, 'student'), eq(people.schoolosId, verify.user.id)))
    .limit(1);
  if (!student)
    return {
      ok: false,
      error: 'ระบบวิชาเสริมใช้เฉพาะนักเรียน ม.4-6 ที่ซิงก์รายชื่อแล้ว — ติดต่อผู้ดูแล',
      status: 403,
    };

  return {
    ok: true,
    user: {
      sub: `person:${student.id}`,
      role: 'student',
      name: verify.user.name || student.fullName,
      firstName: student.firstName,
      personId: student.id,
    },
  };
}

/**
 * Which kind of account this username most likely belongs to, from the mirror
 * this app already keeps. Only ever used to decide which SchoolOS endpoint to
 * try FIRST — a wrong guess costs nothing but the fallback.
 *
 * Worth the query: without it every student login sent their password to the
 * teacher verify endpoint before the student one, doubling the calls (and the
 * chance of tripping the Users Service's own 429) on the common case.
 */
async function likelyType(username: string): Promise<'teacher' | 'student' | null> {
  const [row] = await db
    .select({ type: people.type })
    .from(people)
    .where(eq(people.code, username))
    .limit(1);
  return row?.type === 'teacher' || row?.type === 'student' ? row.type : null;
}

/**
 * Resolve a login attempt.
 *  1. If the username matches a local admin account → verify it (admin only).
 *  2. Otherwise verify against SchoolOS, trying the type the local mirror
 *     suggests first, preferring the most informative failure (a non-401 beats
 *     a plain 401).
 */
export async function resolveLogin(
  username: string,
  password: string,
): Promise<LoginOutcome> {
  const [adminRow] = await db
    .select()
    .from(admins)
    .where(eq(admins.username, username))
    .limit(1);
  if (adminRow) {
    if (!adminRow.active) return BAD_CREDENTIAL;
    const good = await verifyPassword(password, adminRow.passwordHash);
    if (!good) return BAD_CREDENTIAL;
    // The only moment the plaintext is in hand, so it is the only moment an
    // old-cost hash can be quietly upgraded. Best-effort: a failure here must
    // not cost anyone their login.
    if (needsRehash(adminRow.passwordHash)) {
      try {
        await db
          .update(admins)
          .set({ passwordHash: await hashPassword(password) })
          .where(eq(admins.id, adminRow.id));
      } catch {
        /* keep the working hash */
      }
    }
    return {
      ok: true,
      user: { sub: `admin:${adminRow.id}`, role: 'admin', name: adminRow.name, adminId: adminRow.id },
    };
  }

  const first = await likelyType(username);
  const order: ReadonlyArray<'teacher' | 'student'> =
    first === 'student' ? ['student', 'teacher'] : ['teacher', 'student'];

  let best: LoginOutcome | null = null;
  for (const type of order) {
    const outcome = await verifyPerson(type, username, password);
    if (outcome.ok) return outcome;
    if (!best || (outcome.status && outcome.status !== 401)) best = outcome;
  }
  return best ?? BAD_CREDENTIAL;
}
