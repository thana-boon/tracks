import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'tracks_session';

export type AppRole = 'admin' | 'teacher' | 'student';

export interface SessionUser {
  /** stable subject: `admin:<id>` or `person:<personId>` */
  sub: string;
  role: AppRole;
  name: string;
  /** local admin id, when the session came from a local admin account */
  adminId?: number;
  /** people.id, when the session came from a SchoolOS teacher/student */
  personId?: number;
}

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return new TextEncoder().encode(s);
}

export async function createSession(user: SessionUser): Promise<string> {
  const expiresIn = process.env.JWT_EXPIRES_IN ?? '12h';
  return new SignJWT({ ...user, typ: 'session' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret());
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.typ !== 'session') return null;
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

/** Read the current session from the request cookies (server components / routes). */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    maxAge: 60 * 60 * 12,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
