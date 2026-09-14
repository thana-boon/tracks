'use client';

import { useEffect, useRef } from 'react';
import { withBasePath } from '@/lib/base-path';
import { SESSION_EXP_COOKIE } from '@/lib/session-names';
import { endedUrl, portalOf } from '@/lib/session-end';
import { platformExpiry, refreshSchoolOsSession, type SsoConfig } from '@/lib/sso-client';

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

/**
 * Renew the SchoolOS session once less than this is left OF ITS OWN deadline —
 * not on a cadence of ours.
 *
 * The cadence this replaced ("every ten minutes") was counted from the moment
 * this component mounted, which is a clock with no relationship to the one that
 * ends the session. Arrive here through a handoff and the platform's fifteen
 * minutes may be nearly spent already — neither the handoff nor the probe slides
 * it, on purpose — so the first renewal landed after it was over. Worse, a full
 * page load remounts this and starts the ten minutes again, so somebody
 * navigating every nine minutes renewed the platform session never, and was
 * thrown out at minute fifteen with their hands on the keyboard.
 *
 * A third of the fifteen-minute window leaves two whole ticks of room to retry
 * before anything is lost, and still only asks while somebody is actually here.
 */
const PLATFORM_RENEW_UNDER_MS = 5 * 60_000;

/**
 * How long to go between renewals when the deadline is NOT known — no storage
 * (private mode), or an older Users Service that does not report it.
 *
 * Comfortably inside the platform's fifteen minutes, because blind is exactly
 * when there is no second chance. It costs a handful of extra requests an hour
 * from browsers that cannot remember anything, which is the cheap direction to
 * be wrong in.
 */
const PLATFORM_BLIND_GAP_MS = 5 * 60_000;

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
  // Seeded in the effect, not here: reading the clock during render is impure,
  // and the only honest moment to start counting from is when the listeners go on.
  const lastActivity = useRef(0);
  /**
   * Only ever the floor for the blind case below, and deliberately left at 0 on
   * mount: a component that has just appeared knows nothing about the platform's
   * clock, and starting this at `now` is precisely the assumption — "there must
   * be a full window left" — that produced the timeout this file was rewritten
   * to fix. Zero means "ask on the first tick that sees somebody", which is the
   * honest answer.
   */
  const lastBlindRefresh = useRef(0);
  /** Guards against a slow renewal overlapping the next tick. */
  const busy = useRef(false);

  useEffect(() => {
    lastActivity.current = Date.now();

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
          const res = await fetch(withBasePath('/api/auth/renew'), {
            method: 'POST',
            signal: AbortSignal.timeout(10_000),
          }).catch(() => null);

          // 401 is the one answer worth acting on: the session did not merely
          // fail to renew, it has already ended, and /api/auth/renew is the only
          // thing that will say so to a page nobody is navigating away from.
          // Without this, a teacher working inside one screen keeps a dead
          // session on the display until they finally click something — and the
          // click lands on a redirect instead of the button they aimed at.
          //
          // A network failure is emphatically not this: `res` is null, we do
          // nothing, and the next tick tries again.
          if (res?.status === 401) {
            // Straight to the SchoolOS front door — that is where signing in
            // again happens, and a stop at our own form on the way helps
            // nobody. Only a local ผู้ดูแล goes to that form instead: they have
            // no platform session and nothing to sign in there with. The
            // `?ended=idle` they arrive with is what holds SSO off for one idle
            // window, so the timeout they just hit is not immediately undone by
            // whoever the browser happens to be signed in as.
            const portal = via === 'sso' && sso.enabled ? portalOf(sso.portalUrl) : null;
            window.location.assign(endedUrl('idle', portal));
            return;
          }
        }

        // Only a session handed down from SchoolOS has one to keep alive. A
        // local admin account has no platform session at all, and asking on
        // their behalf is a guaranteed 401 every few minutes for nothing.
        if (via === 'sso' && sso.enabled) {
          // SchoolOS's own deadline, kept current by every probe SessionGuard
          // makes (once a minute, and on every page load) — so this survives the
          // remount that used to reset the old timer.
          const platformEnd = platformExpiry();
          const due =
            platformEnd === null
              ? now - lastBlindRefresh.current >= PLATFORM_BLIND_GAP_MS
              : platformEnd - now < PLATFORM_RENEW_UNDER_MS;

          if (due) {
            const res = await refreshSchoolOsSession(sso);
            // Only a SUCCESS moves the floor. The line this replaced marked the
            // attempt as done before it had happened and then threw the answer
            // away, so one failed request — a blink, a 502 from the gateway —
            // cost the whole gap and was never retried. Now a failure simply
            // leaves the deadline where it was, and the next tick tries again
            // while there is still room to.
            if (res.ok) lastBlindRefresh.current = now;
            // A 401 means the platform session is already over, and nothing here
            // can bring it back. It is not this component's call to make:
            // SessionGuard owns signing out, sees the same fact within a minute,
            // and knows where to send them. refreshSchoolOsSession has already
            // dropped the stale deadline.
          }
        }
      } finally {
        busy.current = false;
      }
    };

    // Once straight away, not only after the first minute. Loading a page IS the
    // user moving, and the session this arrived on may be nearly over already —
    // waiting a tick to find that out is how somebody gets thrown out seconds
    // after opening a screen. Every gate above still applies, so a page that is
    // in no danger does nothing here.
    void tick();

    const timer = window.setInterval(() => void tick(), TICK_MS);
    return () => {
      window.clearInterval(timer);
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, seen, { capture: true });
    };
  }, [sso, via]);

  return null;
}
