import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveLogin } from '@/lib/login';
import { createSession, setSessionCookie } from '@/lib/session';
import { dashboardPath } from '@/lib/authz';
import { logActivity, logEvent } from '@/lib/log';
import { clientIp, hit, reset } from '@/lib/rate-limit';

const Body = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

/**
 * Two buckets, because they stop different things:
 *
 *  - per username: someone working through a password list against one account
 *    (the ผู้ดูแล account being the one this app checks itself).
 *  - per address: someone spraying one password across many accounts, which no
 *    per-username counter would ever see.
 *
 * Generous enough that a teacher mistyping their password on a shared machine
 * never meets it.
 */
const WINDOW_MS = 15 * 60 * 1000;
const PER_USERNAME = 8;
const PER_IP = 30;

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ error: 'ข้อมูลไม่ครบถ้วน' }, { status: 400 });

  const { username, password } = parsed.data;
  const ip = clientIp(req.headers);
  const userKey = `login:user:${username.toLowerCase()}`;
  const ipKey = `login:ip:${ip}`;

  const byUser = hit(userKey, PER_USERNAME, WINDOW_MS);
  const byIp = hit(ipKey, PER_IP, WINDOW_MS);
  if (!byUser.ok || !byIp.ok) {
    const retryAfter = Math.max(byUser.retryAfter, byIp.retryAfter);
    await logEvent(`ip:${ip}`, username, 'login_blocked', 'rate_limit', {
      scope: byUser.ok ? 'ip' : 'username',
    });
    return NextResponse.json(
      { error: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  const outcome = await resolveLogin(username, password);
  if (!outcome.ok || !outcome.user) {
    // Recorded whether or not the credential exists — "which accounts are being
    // tried" is exactly what an admin needs to see afterwards.
    await logEvent(`ip:${ip}`, username, 'login_failed', String(outcome.status ?? 401));
    return NextResponse.json(
      { error: outcome.error ?? 'เข้าสู่ระบบไม่สำเร็จ' },
      { status: outcome.status ?? 401 },
    );
  }

  // A correct password clears the counter: the limit is there for guessing, and
  // one person's fat-fingered morning should not shorten their own afternoon.
  reset(userKey);
  reset(ipKey);

  const user = outcome.user;
  const token = await createSession(user);
  await setSessionCookie(token);
  await logActivity(user, 'login', user.role, { ip });

  return NextResponse.json({
    ok: true,
    role: user.role,
    redirect: dashboardPath(user.role),
    name: user.name,
  });
}
