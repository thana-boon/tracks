import 'server-only';
import { admitStudent, admitTeacher, type LoginOutcome, type SchoolOsIdentity } from './login';
import { schoolos, SchoolOsError } from './schoolos';
// The shape is defined beside the browser code that consumes it, so the two
// sides cannot drift; this file is what fills it in.
import type { SsoConfig } from './sso-client';

/**
 * Silent SSO — taking over a session the user already has with SchoolOS.
 *
 * The browser collects a one-time code from the Users Service (it is the only
 * side that holds the `sso_session` cookie, and that cookie is httpOnly so it
 * can never be forwarded), posts the code to our own /api/auth/sso, and this
 * module spends it over the back channel with our API key. The key stays here;
 * the code is worthless without it.
 *
 * What comes back says who the browser is signed in as — and only that. Turning
 * that into "may use this system" is a separate question, answered below by the
 * same roster rules the password form goes through.
 */

export type { SsoConfig };

/**
 * Read once per call from the server environment, never baked into the client
 * bundle. These are not secrets, but they are deployment facts: burning them in
 * at build time means a rebuild every time the platform moves, which is how an
 * app ends up pointing at a hostname that stopped existing months ago.
 */
export function ssoConfig(): SsoConfig {
  // Path-only by default, and that is the whole trick: nginx serves every
  // SchoolOS system from one host, so /users is same-origin with us. No CORS to
  // arrange, and the SchoolOS cookie rides along on its own.
  const usersBase = (process.env.SCHOOLOS_USERS_WEB_BASE ?? '/users').trim().replace(/\/+$/, '');
  const audience = (process.env.SCHOOLOS_SSO_AUDIENCE ?? '').trim();
  const portalUrl = (process.env.SCHOOLOS_PORTAL_URL ?? '/').trim() || '/';
  const off = process.env.SSO_ENABLED === 'false';

  return {
    // No audience means no code can ever be redeemed (`key_audience_unset`), and
    // no key means nothing to redeem it with. Either way SSO cannot work, and
    // saying so up front is better than a silent failure on every login.
    enabled: !off && Boolean(audience) && Boolean(usersBase) && Boolean(process.env.SCHOOLOS_API_KEY),
    usersBase,
    audience,
    portalUrl,
  };
}

/** SSO is misconfigured or the Users Service is unreachable — not the user's fault. */
const SERVICE_TROUBLE: LoginOutcome = {
  ok: false,
  error: 'ระบบเข้าสู่ระบบอัตโนมัติยังไม่พร้อมใช้งาน — แจ้งผู้ดูแลระบบ',
  status: 503,
};

/**
 * Failures of the CODE and failures of the KEY answer differently, because the
 * caller must do different things with them (spec §1.1).
 *
 *  - a stale code is routine: the browser quietly shows the login form instead.
 *  - a key problem is an outage: nobody can sign in this way until an admin
 *    fixes it, and a silent fallback would hide that for weeks.
 *
 * Collapse the two and the symptom becomes "SSO just doesn't work here", with
 * nothing anywhere to say why.
 */
const CODE_FAILURES = new Set(['invalid_code', 'expired_code', 'used_code']);

/**
 * Turn a handoff code into the identity behind it.
 *
 * Throws nothing: every outcome is a LoginOutcome whose `status` tells the route
 * what to answer — 401 (ask the user to sign in normally), 403 (we know who they
 * are and they may not use this system), 503 (our end is broken).
 */
export async function resolveSsoLogin(code: string): Promise<LoginOutcome> {
  const { enabled } = ssoConfig();
  if (!enabled) return SERVICE_TROUBLE;

  let redeemed;
  try {
    redeemed = await schoolos.redeemHandoff(code);
  } catch (e) {
    if (e instanceof SchoolOsError) {
      if (e.code === 'used_code') {
        // Nobody but us can spend our codes, so a second spend is our own
        // double-post. Loud, because the user sees only a login form and will
        // never report it — and retrying the same code can only ever fail.
        console.error('[sso] a handoff code was redeemed twice — this is a bug in this app');
      }
      if (CODE_FAILURES.has(e.code)) return { ok: false, error: 'โค้ดหมดอายุ', status: 401 };
      console.error(`[sso] redeem failed (${e.status} ${e.code}): ${e.message}`);
      return SERVICE_TROUBLE;
    }
    console.error('[sso] redeem failed:', e);
    return SERVICE_TROUBLE;
  }

  if (!redeemed.valid || !redeemed.user)
    return { ok: false, error: 'โค้ดหมดอายุ', status: 401 };

  const { sub, role, name } = redeemed.user;
  const personCode = (redeemed.user.code || sub || '').trim();
  if (!personCode) return SERVICE_TROUBLE;

  const outcome =
    role === 'teacher'
      ? await admitTeacherByCode(personCode, name)
      : await admitStudentByCode(personCode, name);

  /**
   * Stamp the session with WHOSE SchoolOS session it came out of, so the browser
   * can later ask whether that is still the session it has (see
   * SessionUser.ssoSub and the SessionGuard).
   *
   * `sub` first, because that is the field GET /api/auth/session answers with
   * and the comparison has to be against like — the platform's `sub` and `code`
   * are the same string today, and relying on that quietly is how the two drift
   * apart and the check silently starts passing everyone.
   */
  if (outcome.ok && outcome.user) outcome.user.ssoSub = (sub || personCode).trim();
  return outcome;
}

/**
 * Everything below re-reads the roster before letting anyone in.
 *
 * The redeem payload carries no `active` and no `status` — a teacher who
 * resigned in March and a student who graduated may both still be holding a
 * perfectly valid SchoolOS session. `role` there is only ever teacher|student
 * as well, so it cannot even tell us who is an admin. The roster can answer
 * both, and it is the same source the password login already trusts.
 */

/** A teacher, if the roster still recognises them as one who works here. */
async function admitTeacherByCode(code: string, name: string | null): Promise<LoginOutcome> {
  let identity: SchoolOsIdentity | null = null;
  let existsButGone = false;

  try {
    // `q` searches names and e-mail as well as the code, so a substring match is
    // not the person — filter for the exact code afterwards, every time.
    const active = await schoolos.teachers({ q: code, status: 'active', pageSize: 200 });
    const hit = active.data.find((t) => t.teacherCode === code);
    if (hit) {
      identity = {
        id: hit.id,
        code: hit.teacherCode,
        // The roster's own name beats the session's: it is the one the rest of
        // this app was synced with.
        name: hit.fullName || name || hit.teacherCode,
        // The real role, which is the point of asking — `teacher-admin` never
        // appears in a session payload.
        role: hit.role,
        status: hit.employmentStatus,
      };
    } else {
      // Not active. Ask again without the filter, purely to tell "left the
      // school" apart from "no such code" — the same refusal for both would
      // send a resigned teacher hunting for a typo that isn't there.
      const all = await schoolos.teachers({ q: code, status: 'all', pageSize: 200 });
      existsButGone = all.data.some((t) => t.teacherCode === code);
    }
  } catch (e) {
    console.error('[sso] teacher lookup failed:', e);
    return SERVICE_TROUBLE;
  }

  if (!identity)
    return {
      ok: false,
      error: existsButGone
        ? 'บัญชีครูนี้พ้นสภาพแล้ว จึงใช้งานระบบวิชาเสริมไม่ได้ — ติดต่อผู้ดูแลหากคิดว่าผิดพลาด'
        : 'ไม่พบรหัสครูนี้ในทะเบียนของ SchoolOS — ติดต่อผู้ดูแล',
      status: 403,
    };

  return admitTeacher(identity, 'sso');
}

/** A student, if the roster still has them studying. */
async function admitStudentByCode(code: string, name: string | null): Promise<LoginOutcome> {
  let hit;
  try {
    // `status: 'all'` so someone who has graduated is found and told so, rather
    // than silently absent and told their code does not exist.
    const res = await schoolos.students({ q: code, status: 'all', pageSize: 200 });
    hit = res.data.find((s) => s.studentCode === code);
  } catch (e) {
    console.error('[sso] student lookup failed:', e);
    return SERVICE_TROUBLE;
  }

  if (!hit)
    return {
      ok: false,
      error: 'ไม่พบรหัสนักเรียนนี้ในทะเบียนปีการศึกษาปัจจุบัน — ติดต่อผู้ดูแล',
      status: 403,
    };
  if (hit.status !== 'studying')
    return {
      ok: false,
      error: 'บัญชีนักเรียนนี้พ้นสภาพ / จบการศึกษาแล้ว จึงใช้งานระบบวิชาเสริมไม่ได้',
      status: 403,
    };

  return admitStudent(
    {
      id: hit.id,
      code: hit.studentCode,
      name: hit.fullName || name || hit.studentCode,
      role: 'student',
      status: hit.status,
      // The roster's current grade, which is the whole reason this path looks
      // the student up rather than trusting the handoff payload. admitStudent
      // prefers it over the mirror: a student who changed ระดับชั้น since the
      // last sync is judged on where they are today, not where they were.
      gradeLevel: hit.gradeLevel,
    },
    'sso',
  );
}
