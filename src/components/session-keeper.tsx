'use client';

import { useEffect, useRef } from 'react';
import { withBasePath } from '@/lib/base-path';
import { SESSION_EXP_COOKIE } from '@/lib/session-names';
import { refreshSchoolOsSession, type SsoConfig } from '@/lib/sso-client';

/**
 * Keeps a session alive for exactly as long as somebody is using it.
 *
 * Two clocks run at once and neither can be left out:
 *
 *  - ours. The middleware renews on navigation, but a teacher entering marks
 *    into one screen for twenty minutes navigates nowhere, and the idle window
 *    is fifteen. They would be thrown out mid-form.
 *  - SchoolOS's. It deliberately does not treat work in a satellite system as
 *    activity, so the same twenty minutes ends their platform session too —
 *    and then everything else on the platform asks them to sign in again.
 *
 * The whole design rests on ONE condition, and it is the reason this is a
 * component rather than a pair of timers: renew only when the person has
 * actually moved. Renewing because a token is merely getting old means any tab
 * left open on a staff-room machine renews itself for ever, and the idle
 * timeout — the only thing protecting a shared computer — stops existing.
 */

/** Poll rate. Cheap: nearly every tick decides to do nothing at all. */
const TICK_MS = 60_000;

/**
 * How recently they must have moved for a renewal to be honest. Long enough to
 * cover reading a screenful before typing, short enough that a session does not
 * outlive somebody walking away by more than a few minutes.
 */
const ACTIVE_WINDOW_MS = 5 * 60_000;

/**
 * Don't ask until the token is roughly half spent — about where the middleware
 * would renew it on a navigation. Tuned to the fifteen-minute policy, and it
 * degrades sanely either way: a longer idle window just means asking later, a
 * shorter one means asking on most ticks. Neither is wrong, because the gate
 * above decides *whether* to renew and this only decides *when*.
 */
const RENEW_WHEN_REMAINING_MS = 8 * 60_000;

/** How often to tell SchoolOS the user is still here, while they are. */
const SCHOOLOS_REFRESH_MS = 10 * 60_000;

/**
 * What counts as a person being present.
 *
 * `mousemove` is not on the list and must not be added: a lorry going past the
 * window nudges a desk, the mouse reports a pixel of travel, and an empty room
 * keeps its session open all afternoon. Everything here takes an intent.
 */
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'focus'] as const;

/** Read the expiry hint the server left for us (epoch ms), if it is still there. */
function sessionExpiresAt(): number | null {
  const prefix = `${SESSION_EXP_COOKIE}=`;
  const hit = document.cookie.split('; ').find((c) => c.startsWith(prefix));
  if (!hit) return null;
  const n = Number(hit.slice(prefix.length));
  return Number.isFinite(n) ? n : null;
}

export function SessionKeeper({ sso, via }: { sso: SsoConfig; via?: string }) {
  const lastActivity = useRef(Date.now());
  const lastSchoolOsRefresh = useRef(Date.now());
  /** Guards against a slow renewal overlapping the next tick. */
  const busy = useRef(false);

  useEffect(() => {
    const seen = () => {
      lastActivity.current = Date.now();
    };
    // Passive: these listeners only ever write a number, and scroll handlers
    // that can't preventDefault let the browser keep scrolling smoothly.
    for (const ev of ACTIVITY_EVENTS)
      window.addEventListener(ev, seen, { passive: true, capture: true });

    const tick = async () => {
      if (busy.current) return;
      const now = Date.now();
      // The one gate that matters. Everything below it is timing.
      if (now - lastActivity.current > ACTIVE_WINDOW_MS) return;

      busy.current = true;
      try {
        const expiresAt = sessionExpiresAt();
        // No hint cookie means no session to extend — the middleware will send
        // them to the login page on their next move, which is correct. Renewing
        // blind from here could only ever revive something already gone.
        if (expiresAt !== null && expiresAt - now < RENEW_WHEN_REMAINING_MS) {
          await fetch(withBasePath('/api/auth/renew'), {
            method: 'POST',
            signal: AbortSignal.timeout(10_000),
          }).catch(() => null);
        }

        // Only a session handed down from SchoolOS has one to keep alive. A
        // local admin account has no platform session at all, and asking on
        // their behalf is a guaranteed 401 every ten minutes for nothing.
        if (
          via === 'sso' &&
          sso.enabled &&
          now - lastSchoolOsRefresh.current >= SCHOOLOS_REFRESH_MS
        ) {
          lastSchoolOsRefresh.current = now;
          await refreshSchoolOsSession(sso);
        }
      } finally {
        busy.current = false;
      }
    };

    const timer = window.setInterval(() => void tick(), TICK_MS);
    return () => {
      window.clearInterval(timer);
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, seen, { capture: true });
    };
  }, [sso, via]);

  return null;
}
