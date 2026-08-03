import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { admins, people } from '@/db/schema';
import { hashPassword, needsRehash, verifyPassword } from './password';
import { schoolos, SchoolOsError } from './schoolos';
import { hasAdminGrant } from './admin-grants';
import { isTrackGrade } from './utils';
import type { SessionUser, SessionVia } from './session';

export interface LoginOutcome {
  ok: boolean;
  user?: SessionUser;
  error?: string;
  status?: number;
}

/**
 * A SchoolOS person, however we came to be sure of them — the password form's
 * `/auth/verify` answer, or the roster lookup that follows an SSO handoff.
 *
 * The two arrive by completely different routes and must end up governed by
 * exactly one set of rules; this is the shape both are flattened into before
 * `admitTeacher` / `admitStudent` decide anything.
 */
export interface SchoolOsIdentity {
  /** teachers.id / students.id in the Users Service */
  id: number;
  code: string;
  name: string;
  /** teachers only: `teacher` | `teacher-admin`, straight from the roster */
  role: string;
  /** `active`/`resigned` for teachers, `studying`/`graduated`/… for students */
  status: string;
  /**
   * Students only: the grade the roster reports for them *right now*.
   *
   * Absent on the password path — `/auth/verify` does not carry a grade — so
   * `admitStudent` falls back to the mirror. The SSO path does look the student
   * up in the roster and fills it in, and that fresher answer wins.
   */
  gradeLevel?: string | null;
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
 * Admit a verified teacher.
 *
 * The Users Service is authoritative for the role — `teacher-admin` enters this
 * system as admin, plain `teacher` as teacher (spec §2). The person row is
 * upserted from the identity so a teacher can get in before the roster sync has
 * ever run.
 *
 * Shared deliberately with the SSO route. When these rules lived inside the
 * password path alone, the second entrance had to restate them, and two copies
 * of "who may come in" drift — the day they disagree, somebody gets in through
 * one door who is refused at the other, and nobody finds out from the code.
 */
export async function admitTeacher(
  identity: SchoolOsIdentity,
  via: SessionVia,
): Promise<LoginOutcome> {
  const [existing] = await db
    .select({ id: people.id, fullName: people.fullName, firstName: people.firstName })
    .from(people)
    .where(and(eq(people.type, 'teacher'), eq(people.schoolosId, identity.id)))
    .limit(1);

  let personId: number;
  if (existing) {
    personId = existing.id;
    await db
      .update(people)
      .set({ schoolosRole: identity.role, status: identity.status, syncedAt: new Date() })
      .where(eq(people.id, personId));
  } else {
    const name = identity.name || identity.code;
    const [inserted] = await db
      .insert(people)
      .values({
        type: 'teacher',
        schoolosId: identity.id,
        code: identity.code,
        firstName: name,
        lastName: '',
        fullName: name,
        schoolosRole: identity.role,
        status: identity.status,
      })
      .returning({ id: people.id });
    personId = inserted.id;
  }

  // Two independent ways to be an admin here: the Users Service says so, or
  // this school added a local grant on หน้าสิทธิ์. Neither can revoke the
  // other — the grant is additive by design.
  const role: 'admin' | 'teacher' =
    identity.role === 'teacher-admin' || (await hasAdminGrant(personId)) ? 'admin' : 'teacher';

  return {
    ok: true,
    user: {
      sub: `person:${personId}`,
      role,
      name: identity.name || identity.code,
      // The synced row is the only place ชื่อจริง is split out; before the
      // first sync the avatar falls back to stripping the คำนำหน้า itself.
      firstName: existing?.firstName,
      personId,
      via,
    },
  };
}

/**
 * Admit a verified student — ม.4, ม.5 หรือ ม.6 เท่านั้น, and only with a synced
 * `people` row. A ม.1 student verifies perfectly well upstream and still has no
 * business here: วิชาเสริม is a ม.ปลาย programme.
 *
 * Two independent checks, because each covers what the other cannot. The row
 * has to exist at all — the sync (admin > รายชื่อ) only ever pulls TRACK_GRADES,
 * so a junior student has nothing to match. And the grade on whichever record
 * is freshest has to actually be one of the three. Until now only the first was
 * enforced, which made "ม.4-6 only" a property of how the sync happened to be
 * configured rather than a rule this system states: widen TRACK_GRADES for one
 * report, or leave behind a row from a student who has since moved down, and
 * the login quietly widens with it. The grade is now asked about out loud.
 */
export async function admitStudent(
  identity: SchoolOsIdentity,
  via: SessionVia,
): Promise<LoginOutcome> {
  const [student] = await db
    .select({
      id: people.id,
      fullName: people.fullName,
      firstName: people.firstName,
      gradeLevel: people.gradeLevel,
    })
    .from(people)
    .where(and(eq(people.type, 'student'), eq(people.schoolosId, identity.id)))
    .limit(1);
  if (!student)
    return {
      ok: false,
      error: 'ระบบวิชาเสริมใช้เฉพาะนักเรียน ม.4-6 ที่ซิงก์รายชื่อแล้ว — ติดต่อผู้ดูแล',
      status: 403,
    };

  // The roster's answer when we have one, the mirror's otherwise. `??` on
  // purpose: a null from the roster means "no enrolment in the current year"
  // (Users API §5.3), not "no grade" — the same reason syncStudents refuses to
  // overwrite a stored grade with null.
  const gradeLevel = identity.gradeLevel ?? student.gradeLevel;
  if (!isTrackGrade(gradeLevel))
    return {
      ok: false,
      // Says which grades, and does not say which grade we think they are in:
      // the message is shown before any session exists, to whoever typed the
      // password.
      error: 'ระบบวิชาเสริมเปิดให้เฉพาะนักเรียน ม.4-6 เท่านั้น',
      status: 403,
    };

  return {
    ok: true,
    user: {
      sub: `person:${student.id}`,
      role: 'student',
      name: identity.name || student.fullName,
      firstName: student.firstName,
      personId: student.id,
      via,
    },
  };
}

/** Verify a SchoolOS credential, then admit whoever it turned out to be. */
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

  // The role is refreshed from this payload on every login, so a promotion to
  // teacher-admin applies immediately rather than waiting for the next sync.
  const identity: SchoolOsIdentity = {
    id: verify.user.id,
    code: verify.user.code || username,
    // Left empty rather than filled in with the username: the admit functions
    // have better fallbacks than a login code — the synced full name — and can
    // only use them if they can tell "no name" from "a name that is the code".
    name: verify.user.name || '',
    role: verify.user.role,
    status: verify.user.status,
  };

  return type === 'teacher'
    ? admitTeacher(identity, 'password')
    : admitStudent(identity, 'password');
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
      user: {
        sub: `admin:${adminRow.id}`,
        role: 'admin',
        name: adminRow.name,
        adminId: adminRow.id,
        via: 'password',
      },
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
