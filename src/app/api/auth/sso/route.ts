import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSsoLogin } from '@/lib/sso';
import { createSession, setSessionCookie } from '@/lib/session';
import { dashboardPath } from '@/lib/authz';
import { logActivity, logEvent } from '@/lib/log';
import { clientIp, hit } from '@/lib/rate-limit';

const Body = z.object({
  // `hc_` + 32 random bytes in base64url. Bounded, not pattern-matched: the
  // Users Service owns the format and may lengthen it.
  code: z.string().min(1).max(200),
});

/**
 * POST /api/auth/sso — spend a handoff code for a session of our own.
 *
 * Its own rate-limit bucket, kept well away from /api/auth/login's. The login
 * page fires this by itself every time it opens, so sharing a counter would
 * mean a teacher who reloaded the page a few times had locked themselves out of
 * their own password — a self-inflicted denial of service that would look, from
 * the outside, exactly like a forgotten password.
 *
 * Per address only. There is no username to count against here, and a school
 * building is one NAT address: the ceiling has to clear a whole staff room
 * arriving at 07:30 while still being a ceiling. Every request also costs the
 * caller a code, and the Users Service already rations those at 10/minute per
 * session, so this is a backstop rather than the real defence.
 */
const WINDOW_MS = 15 * 60 * 1000;
const PER_IP = 240;

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ error: 'ข้อมูลไม่ครบถ้วน' }, { status: 400 });

  const ip = clientIp(req.headers);
  const gate = hit(`sso:ip:${ip}`, PER_IP, WINDOW_MS);
  if (!gate.ok) {
    await logEvent(`ip:${ip}`, 'sso', 'login_blocked', 'rate_limit', { scope: 'sso' });
    return NextResponse.json(
      { error: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfter) } },
    );
  }

  const outcome = await resolveSsoLogin(parsed.data.code);
  if (!outcome.ok || !outcome.user) {
    const status = outcome.status ?? 401;
    // A 401 here is the ordinary "that code was stale" and happens to anyone who
    // left a tab open; it is not worth an audit row. A refusal (403) and an
    // outage (503) both are.
    if (status !== 401)
      await logEvent(`ip:${ip}`, 'sso', 'login_failed', String(status), { via: 'sso' });
    return NextResponse.json(
      { error: outcome.error ?? 'เข้าสู่ระบบไม่สำเร็จ' },
      { status },
    );
  }

  const user = outcome.user;
  await setSessionCookie(await createSession(user));
  await logActivity(user, 'login', user.role, { ip, via: 'sso' });

  return NextResponse.json({
    ok: true,
    role: user.role,
    redirect: dashboardPath(user.role),
    name: user.name,
  });
}
