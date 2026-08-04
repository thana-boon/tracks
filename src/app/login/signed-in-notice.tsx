'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, UserRoundCog } from 'lucide-react';
import { Button } from '@/components/ui';
import { Avatar } from '@/components/avatar';
import { withBasePath } from '@/lib/base-path';
import { logoutUrl, type SsoConfig } from '@/lib/sso-client';

/**
 * What /login shows to somebody who is already signed in.
 *
 * It used to redirect them to their dashboard on sight, which is fine for the
 * one person that page belongs to and wrong for everybody else at the same
 * machine. The journey it broke: a student signs in, closes the browser, the
 * next student opens it and asks for the login page — and is sent, without ever
 * seeing a form, into the first student's account. There was no way out of it
 * either: every route to a login form went through the page that was doing the
 * redirecting.
 *
 * So the page now says whose session it found and offers both answers. Nothing
 * here weakens the session — it is still perfectly valid, and "ใช้บัญชีนี้ต่อ"
 * is one press — but it can no longer be inherited in silence.
 */
export function SignedInNotice({
  name,
  firstName,
  roleLabel,
  photoUrl,
  continueTo,
  sso,
}: {
  name: string;
  firstName?: string;
  roleLabel: string;
  photoUrl?: string | null;
  /** where "carry on" goes — their dashboard, or the page they were sent from */
  continueTo: string;
  sso: SsoConfig;
}) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  /**
   * Sign the found session out and come back here to a form.
   *
   * Ours first and awaited — a request fired off as the page changes is
   * cancelled often enough to matter — and then SchoolOS's, by top-level
   * navigation, returning to this page. Clearing only ours would achieve
   * nothing: the platform cookie belongs to the browser, so silent SSO would
   * read it on the way back and sign the same person in again, which from the
   * outside looks exactly like the button not working.
   */
  async function useAnother() {
    if (leaving) return;
    setLeaving(true);
    await fetch(withBasePath('/api/auth/logout'), { method: 'POST' }).catch(() => null);

    const back = withBasePath('/login');
    // A full load, never router.push: the page we are on was rendered for the
    // session we have just thrown away.
    window.location.assign(sso.enabled ? logoutUrl(sso, back) : back);
  }

  return (
    <div className="space-y-4 anim-fade-up">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 p-4">
        <Avatar
          src={photoUrl}
          name={firstName || name}
          className="size-11 shrink-0 bg-primary text-sm font-semibold text-[#F5C518]"
        />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {roleLabel} · เข้าสู่ระบบอยู่แล้ว
          </p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        เครื่องนี้ยังค้างการเข้าสู่ระบบของบัญชีข้างบนอยู่
        หากไม่ใช่คุณ ให้เลือก “เข้าสู่ระบบด้วยบัญชีอื่น” เพื่อออกจากบัญชีนี้ก่อน
      </p>

      <Button
        size="lg"
        className="w-full"
        disabled={leaving}
        onClick={() => {
          router.replace(continueTo);
          router.refresh();
        }}
      >
        <ArrowRight className="size-4.5" strokeWidth={1.8} />
        ใช้บัญชีนี้ต่อ
      </Button>

      <Button
        size="lg"
        variant="secondary"
        className="w-full"
        disabled={leaving}
        onClick={useAnother}
      >
        {leaving ? (
          <Loader2 className="size-4.5 animate-spin" />
        ) : (
          <UserRoundCog className="size-4.5" strokeWidth={1.8} />
        )}
        เข้าสู่ระบบด้วยบัญชีอื่น
      </Button>
    </div>
  );
}
