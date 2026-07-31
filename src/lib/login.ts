import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { admins, people } from '@/db/schema';
import { verifyPassword } from './password';
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
      if (e.status === 429)
        return { ok: false, error: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่', status: 429 };
      return { ok: false, error: 'เชื่อมต่อ SchoolOS ไม่สำเร็จ', status: 502 };
    }
    return { ok: false, error: 'เกิดข้อผิดพลาด', status: 500 };
  }

  if (!verify.valid || !verify.user)
    return { ok: false, error: 'รหัสผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง', status: 401 };
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
 * Resolve a login attempt.
 *  1. If the username matches a local admin account → verify it (admin only).
 *  2. Otherwise verify against SchoolOS as a teacher, then as a student,
 *     preferring the most informative failure (a non-401 beats a plain 401).
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
    if (!adminRow.active) return { ok: false, error: 'บัญชีผู้ดูแลไม่ถูกต้อง', status: 401 };
    const good = await verifyPassword(password, adminRow.passwordHash);
    if (!good) return { ok: false, error: 'รหัสผ่านไม่ถูกต้อง', status: 401 };
    return {
      ok: true,
      user: { sub: `admin:${adminRow.id}`, role: 'admin', name: adminRow.name, adminId: adminRow.id },
    };
  }

  let best: LoginOutcome | null = null;
  for (const type of ['teacher', 'student'] as const) {
    const outcome = await verifyPerson(type, username, password);
    if (outcome.ok) return outcome;
    if (!best || (outcome.status && outcome.status !== 401)) best = outcome;
  }
  return best ?? { ok: false, error: 'รหัสผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง', status: 401 };
}
