'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { withBasePath } from '@/lib/base-path';
import { logoutUrl, markSignedOut, type SsoConfig } from '@/lib/sso-client';

/**
 * Sign out of this system, and then out of SchoolOS.
 *
 * Shared by the two places that offer it — the sidebar button and the menu
 * under the account photo — so there is one signing-out path, not two that
 * drift apart.
 *
 * Order matters and so does the `await`. Our own cookie is cleared first,
 * on our own origin, and we wait for it: firing that request off and changing
 * the page in the same breath lets the browser cancel it mid-flight, and the
 * failure is completely silent.
 *
 * Then a top-level navigation to the platform's logout — not a background
 * POST, for the same reason. Signing out of here alone would not be signing
 * out at all: the SchoolOS cookie belongs to the browser, not the tab, and
 * the next visit to this system would be walked straight back in by SSO. On
 * the shared machines in the staff room, that is the difference between a
 * logout button and a decoration.
 *
 * The "recently signed out" flag is deliberately NOT set on that path. It
 * exists to stop SSO undoing an *idle timeout*; pressing this button is not
 * that, and ending the SchoolOS session already stops SSO bringing them back —
 * whereas setting the flag would lock somebody out of silent sign-in for a
 * quarter of an hour after they had signed into SchoolOS again, which is
 * precisely the journey this button is usually the first step of. The local
 * ผู้ดูแล is the exception, below: there is no platform session of theirs to
 * end, so the flag is the only thing keeping SSO from signing them straight
 * back in as whoever else the browser is holding.
 */
export function useLogout({ sso, via }: { sso: SsoConfig; via?: string }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  async function logout() {
    if (leaving) return;
    setLeaving(true);
    await fetch(withBasePath('/api/auth/logout'), { method: 'POST' }).catch(() => null);

    // Only a session handed down from SchoolOS ends over there. A local ผู้ดูแล
    // has no platform session of their own, so following this branch would tear
    // down whichever SchoolOS session the browser happens to be holding — on
    // somebody else's behalf — and then strand the admin at a portal they have
    // no account for. They get the flag instead: without it silent SSO signs
    // them straight back in as that other person on the next page.
    if (sso.enabled && via === 'sso') {
      window.location.assign(logoutUrl(sso));
      return;
    }
    if (sso.enabled) markSignedOut();
    toast.success('ออกจากระบบแล้ว');
    router.replace('/login');
    router.refresh();
  }

  return { logout, leaving };
}
