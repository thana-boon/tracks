'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { withBasePath } from '@/lib/base-path';
import { endedUrl, portalOf, type SessionEnd } from '@/lib/session-end';
import {
  exchangeCode,
  fetchLiveSession,
  getHandoffCode,
  markSignedOut,
  type SsoConfig,
} from '@/lib/sso-client';

/**
 * Makes sure the person this page was rendered for is still the person the
 * browser is signed in to SchoolOS as.
 *
 * The bug it exists for: our session cookie is minted once, at the handoff, and
 * then believed until it expires. Sign out of the portal, sign in as somebody
 * else, come back here — the cookie is untouched and perfectly valid, so this
 * system cheerfully serves the first person's timetable to the second one. On
 * shared staff-room machines that is not a stale cache, it is the wrong pupil's
 * marks on screen.
 *
 * The fix is the one thing the cookie cannot do for itself: ask SchoolOS, on
 * every page load, who the browser actually is (GET /api/auth/session — cookie
 * based, no key, and deliberately does not slide the platform's idle window, so
 * it is safe to ask this often). If the answer is not who we admitted, this
 * session is a leftover and is replaced with a fresh handoff — silently, since
 * the new person is already signed in and has nothing to type.
 *
 * Password sessions are exempt: a local ผู้ดูแล has no platform session to be
 * measured against, and comparing them with whoever the browser happens to be
 * signed in as would sign them out of their own system.
 */

/** Re-ask this often while the tab is in front. */
const RECHECK_MS = 60_000;

/** Floor between probes, so focus-flipping between tabs cannot spam the service. */
const MIN_GAP_MS = 10_000;

/**
 * How long a takeover suppresses the next one.
 *
 * A swap ends in a full page load, which mounts this component again and probes
 * again — and if it were still to disagree, that is a loop that reloads the
 * browser for ever. It can only happen when a session carries no `ssoSub` to
 * compare (a token minted before this shipped, or a deployment where the claim
 * never lands), and the honest answer in that case is the login form, not an
 * infinite retry.
 */
const SWAP_GUARD_MS = 30_000;
const SWAP_KEY = 'tracks:sso-swapped-at';

/** Per tab, and it must be: it guards one page's reload loop, not the browser's. */
function swappedRecently(): boolean {
  try {
    const at = Number(window.sessionStorage.getItem(SWAP_KEY) ?? 0);
    return Number.isFinite(at) && Date.now() - at < SWAP_GUARD_MS;
  } catch {
    // No sessionStorage (private mode). Treat as "just swapped": refusing a
    // silent takeover costs one login form, allowing a loop costs the browser.
    return true;
  }
}

function noteSwap(): void {
  try {
    window.sessionStorage.setItem(SWAP_KEY, String(Date.now()));
  } catch {
    /* handled by swappedRecently returning true */
  }
}

export function SessionGuard({
  sso,
  via,
  ssoSub,
}: {
  sso: SsoConfig;
  /** only an SSO session has a platform session to be checked against */
  via?: string;
  /** the SchoolOS `sub` this session was handed down from */
  ssoSub?: string;
}) {
  const [swapping, setSwapping] = useState(false);
  const busy = useRef(false);
  const lastCheck = useRef(0);

  /**
   * Drop our cookie and go back to a front door, on a full load.
   *
   * `ended` is set only when the session did not just become the wrong one but
   * genuinely finished. That one goes to the SchoolOS front door itself, since
   * signing in again is something only SchoolOS can do (see session-end.ts).
   * Everywhere else our login page is the destination, because it is the only
   * place that can say *why* this person may not be here.
   */
  const signOut = useCallback(
    async ({ suppressSso = false, ended }: { suppressSso?: boolean; ended?: SessionEnd } = {}) => {
      if (suppressSso) markSignedOut();
      await fetch(withBasePath('/api/auth/logout'), { method: 'POST' }).catch(() => null);
      // Not router.replace: the session it would carry over is the one we just
      // threw away, and a client navigation would re-render this page from a
      // cache built for the wrong person.
      window.location.assign(
        ended ? endedUrl(ended, portalOf(sso.portalUrl)) : withBasePath('/login'),
      );
    },
    [sso.portalUrl],
  );

  const check = useCallback(async () => {
    if (busy.current) return;
    const now = Date.now();
    if (now - lastCheck.current < MIN_GAP_MS) return;

    busy.current = true;
    lastCheck.current = now;
    try {
      const live = await fetchLiveSession(sso);
      // Could not ask. Never act on this: an unanswered question is not an
      // answer of "nobody", and treating it as one signs the school out every
      // time the network blinks.
      if (!live) return;

      // The platform's `sub` is the person's code; accept `code` too, so a
      // future where the two stop being the same string does not break this.
      if (live.valid && ssoSub && (live.sub === ssoSub || live.code === ssoSub)) return;

      setSwapping(true);

      // Nobody is signed in to SchoolOS any more — they logged out of the
      // platform, or its own idle window ran out, here or in another tab. Our
      // session was only ever theirs on loan, so it goes too, and they are taken
      // back to the portal: signing in again is something only SchoolOS can do
      // for them, and our login form cannot (their password lives there, not
      // here). No suppression — once they are back in, SSO should pick them up.
      if (!live.valid) {
        await signOut({ ended: 'sso' });
        return;
      }

      // Somebody else is. One takeover attempt, then we stop trying — see
      // SWAP_GUARD_MS.
      if (swappedRecently()) {
        await signOut({ suppressSso: true });
        return;
      }
      noteSwap();

      const code = await getHandoffCode(sso);
      const res = code ? await exchangeCode(code) : null;
      if (res?.ok) {
        // A full load, not router.refresh(): the page we are standing on may
        // not even be one this new person may open, and the server has to pick
        // the landing page for their role.
        window.location.assign(withBasePath(res.redirect ?? '/'));
        return;
      }

      // They are signed in to SchoolOS but cannot have a session here — not on
      // the roster, graduated, resigned. The login page says which; all we can
      // do is stop showing them the previous person's screen.
      await signOut();
    } finally {
      busy.current = false;
    }
  }, [sso, ssoSub, signOut]);

  useEffect(() => {
    if (!sso.enabled || via !== 'sso') return;

    void check();

    const onReturn = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void check();
    }, RECHECK_MS);

    return () => {
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
      window.clearInterval(timer);
    };
  }, [sso.enabled, via, check]);

  if (!swapping) return null;

  // Covers the page for the moment between "this is the wrong person" and the
  // navigation that fixes it — short, but long enough to click something in.
  return (
    <div className="fixed inset-0 z-100 grid place-items-center bg-background/90 backdrop-blur-sm">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="size-5 animate-spin" strokeWidth={1.8} />
        บัญชี SchoolOS เปลี่ยนไปแล้ว — กำลังสลับบัญชี…
      </div>
    </div>
  );
}
