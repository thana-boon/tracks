'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Eye, EyeOff, LogIn, Loader2 } from 'lucide-react';
import { Button, Input, Label } from '@/components/ui';
import { withBasePath } from '@/lib/base-path';
import {
  clearSignedOut,
  exchangeCode,
  getHandoffCode,
  markSignedOut,
  recentlySignedOut,
  type SsoConfig,
} from '@/lib/sso-client';

/**
 * The Users Service rations handoff codes at 10 per minute per session, and a
 * teacher flipping between tabs can pass through here a lot. Fifteen seconds
 * between tries leaves that budget alone while still feeling instant to anyone
 * who has just signed in next door.
 */
const RETRY_GAP_MS = 15_000;

/** How long the "your session ended" notice stays up before the portal. */
const LEAVE_AFTER_MS = 2_500;

export function LoginForm({ sso }: { sso: SsoConfig }) {
  const router = useRouter();
  const params = useSearchParams();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const gone = params.get('gone');
  /**
   * Read once, at mount, and then taken out of the address bar. Left in place it
   * would fire again on every refresh and every press of Back — turning "your
   * session ended" into a page that keeps throwing the user at the portal.
   */
  const [ended] = useState(() => params.get('expired') === '1');
  const [leaving, setLeaving] = useState(false);

  /**
   * Whether to keep the form hidden while SSO is being tried.
   *
   * Starts true whenever a silent sign-in is even possible, because the
   * alternative is a login form flashing in front of somebody who was never
   * going to need it. It is only ever turned OFF — no path switches the spinner
   * back on later, which is what stops the form flickering each time the tab
   * regains focus.
   *
   * Computed from props alone, never from storage: this component renders on the
   * server too, and localStorage does not exist there.
   */
  const [probing, setProbing] = useState(sso.enabled);

  /** A refusal worth showing: SchoolOS knows them, this system still says no. */
  const [ssoError, setSsoError] = useState<string | null>(null);

  /**
   * Has the user started filling the form in?
   *
   * If they have, silent SSO must not sweep them into whichever account the
   * browser happens to be holding — a teacher signing a student in on their own
   * laptop means the account being typed, and taking that away mid-word is both
   * baffling and wrong. A ref, because the listeners below outlive the render
   * that created them.
   */
  const typed = useRef(false);
  const attempt = useRef({ at: 0, running: false });

  const trySilentSignIn = useCallback(async () => {
    if (!sso.enabled) return;
    const state = attempt.current;
    if (state.running || Date.now() - state.at < RETRY_GAP_MS) return;

    // Re-read every time, never cached: the flag expires between tries, and
    // giving it a timestamp was the entire point.
    if (recentlySignedOut() || typed.current) {
      setProbing(false);
      return;
    }

    state.running = true;
    state.at = Date.now();
    try {
      const code = await getHandoffCode(sso);
      // Not signed in to SchoolOS, or it would not say. Ordinary; show the form.
      if (!code) {
        setProbing(false);
        return;
      }

      const res = await exchangeCode(code);
      if (res.ok) {
        clearSignedOut();
        const next = params.get('next');
        const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
        router.replace(safeNext ?? res.redirect ?? '/');
        router.refresh();
        // Deliberately leaves `probing` set: the spinner has to carry them
        // through the navigation, or the form appears for the moment between.
        return;
      }

      // 401 is the routine "that code was stale" — say nothing, show the form.
      // A refusal (403) and an outage (503) are the two nobody can work out for
      // themselves, and typing a password will not help with either.
      if ((res.status === 403 || res.status === 503) && res.error) setSsoError(res.error);
      setProbing(false);
    } finally {
      state.running = false;
    }
  }, [sso, router, params]);

  // ── first pass ───────────────────────────────────────────────
  useEffect(() => {
    // Strip the one-shot markers so a refresh is a plain visit to /login.
    const url = new URL(window.location.href);
    if (url.searchParams.has('expired') || url.searchParams.has('gone')) {
      url.searchParams.delete('expired');
      url.searchParams.delete('gone');
      window.history.replaceState(null, '', url.toString());
    }

    if (ended) {
      // The session ran out. Holding SSO off for one idle window is what makes
      // the timeout mean anything — without it they are signed straight back in
      // and never learn they were signed out at all.
      markSignedOut();
      setProbing(false);
      setLeaving(true);
      return;
    }

    if (gone) {
      // The roster says this account has left. Its cookie is still valid, so
      // drop it — a server component cannot — and keep SSO off it.
      void fetch(withBasePath('/api/auth/logout'), { method: 'POST' });
      markSignedOut();
      setProbing(false);
      toast.error('บัญชีนี้ไม่มีสิทธิ์ใช้งานแล้ว — ติดต่อผู้ดูแลหากคิดว่าผิดพลาด');
      return;
    }

    if (!sso.enabled) {
      setProbing(false);
      return;
    }
    void trySilentSignIn();
    // Mount only: trySilentSignIn guards its own re-entry, and re-running this
    // on every render would fight the retry gap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── try again when they come back to this tab ────────────────
  /**
   * Without this, one specific journey dead-ends: sign out here, sign in to
   * SchoolOS in another tab, come back — and this page is still mounted from
   * before, has already made its decision, and does nothing at all. The user is
   * left pressing F5 on a form they should never have been shown.
   *
   * It never re-hides the form, so somebody genuinely signing in by hand sees no
   * flicker as they switch windows.
   */
  useEffect(() => {
    if (!sso.enabled || ended) return;
    const onReturn = () => {
      if (document.visibilityState !== 'visible') return;
      void trySilentSignIn();
    };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    return () => {
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
    };
  }, [sso.enabled, ended, trySilentSignIn]);

  // ── an ended session belongs at the platform's front door ────
  /**
   * Only ever on the way out of a session that just ended — never something this
   * page does merely by rendering. A login page that bounces on sight loops
   * against the portal, and it would put the local ผู้ดูแล account out of reach
   * as well, so the day SchoolOS is down this system would go down with it. The
   * "stay here" link below exists for exactly that day.
   */
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => window.location.assign(sso.portalUrl), LEAVE_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [leaving, sso.portalUrl]);

  function onType(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      typed.current = true;
      setter(e.target.value);
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(withBasePath('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'เข้าสู่ระบบไม่สำเร็จ');
        return;
      }
      // In, by hand. Whatever ended the last session is settled.
      clearSignedOut();
      toast.success(`ยินดีต้อนรับ ${data.name ?? ''}`.trim());
      // `next` comes off the query string: only a path within this app is a
      // legal destination. "//evil.example" also starts with "/" and would send
      // them off-site, so it has to be excluded explicitly.
      const next = params.get('next');
      const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
      router.replace(safeNext ?? data.redirect ?? '/');
      router.refresh();
    } catch {
      toast.error('เชื่อมต่อไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  if (leaving)
    return (
      <div className="space-y-4 anim-fade-up">
        <div className="rounded-xl border border-border bg-secondary/40 p-4">
          <p className="text-sm font-medium">หมดเวลาการใช้งาน</p>
          <p className="mt-1 text-sm text-muted-foreground">
            ไม่มีการใช้งานนานเกินกำหนด ระบบจึงออกจากระบบให้อัตโนมัติ
            กำลังพากลับไปหน้าแรกของ SchoolOS…
          </p>
        </div>
        <Button size="lg" className="w-full" onClick={() => window.location.assign(sso.portalUrl)}>
          ไปหน้าแรก SchoolOS
        </Button>
        <button
          type="button"
          onClick={() => setLeaving(false)}
          className="w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          เข้าสู่ระบบที่หน้านี้แทน
        </button>
      </div>
    );

  if (probing)
    return (
      <div className="flex items-center justify-center gap-3 py-14 text-sm text-muted-foreground">
        <Loader2 className="size-5 animate-spin" strokeWidth={1.8} />
        กำลังตรวจสอบการเข้าสู่ระบบ SchoolOS…
      </div>
    );

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {ssoError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {ssoError}
        </div>
      ) : null}

      <div>
        <Label htmlFor="username">ชื่อผู้ใช้ / รหัสประจำตัว</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          value={username}
          onChange={onType(setUsername)}
          placeholder="ผู้ดูแล · รหัสครู · รหัสนักเรียน"
          required
          autoFocus
        />
      </div>

      <div>
        <Label htmlFor="password">รหัสผ่าน</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={onType(setPassword)}
            className="pr-11"
            required
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
            className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground"
          >
            {show ? <EyeOff className="size-4.5" strokeWidth={1.7} /> : <Eye className="size-4.5" strokeWidth={1.7} />}
          </button>
        </div>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={loading}>
        {loading ? (
          <Loader2 className="size-4.5 animate-spin" />
        ) : (
          <LogIn className="size-4.5" strokeWidth={1.8} />
        )}
        เข้าสู่ระบบ
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        ระบบจะตรวจสอบประเภทบัญชีให้อัตโนมัติ — ผู้ดูแล ครู หรือนักเรียน
        (ครู/นักเรียนตรวจสอบผ่าน SchoolOS · นักเรียนเฉพาะ ม.4-6 ที่ซิงก์แล้ว)
      </p>
    </form>
  );
}
