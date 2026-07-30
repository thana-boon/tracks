import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveLogin } from '@/lib/login';
import { createSession, setSessionCookie } from '@/lib/session';
import { dashboardPath } from '@/lib/authz';
import { logActivity } from '@/lib/log';

const Body = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success)
    return NextResponse.json({ error: 'ข้อมูลไม่ครบถ้วน' }, { status: 400 });

  const { username, password } = parsed.data;
  const outcome = await resolveLogin(username, password);
  if (!outcome.ok || !outcome.user)
    return NextResponse.json(
      { error: outcome.error ?? 'เข้าสู่ระบบไม่สำเร็จ' },
      { status: outcome.status ?? 401 },
    );

  const user = outcome.user;
  const token = await createSession(user);
  await setSessionCookie(token);
  await logActivity(user, 'login', user.role);

  return NextResponse.json({
    ok: true,
    role: user.role,
    redirect: dashboardPath(user.role),
    name: user.name,
  });
}
