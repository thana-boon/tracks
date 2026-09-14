import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSession,
  verifySession,
  identityOf,
  sessionTtlSeconds,
  sessionMaxSeconds,
  shouldRenew,
  sessionCookieOptions,
  expCookieOptions,
  PLATFORM_IDLE_SECONDS,
  PLATFORM_PWA_IDLE_DAYS,
  refusedClient,
} from './session-core';

// Every setting is read at call time, not at import time, so this lands before
// anything that needs it.
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-to-be-a-secret';

const user = { sub: 'person:1', role: 'teacher' as const, name: 'ครูทดสอบ', personId: 1 };

test('JWT_EXPIRES_IN is read in every unit the deploy might use', () => {
  const cases: [string, number][] = [
    ['12h', 43200],
    ['30m', 1800],
    ['1d', 86400],
    ['45s', 45],
    ['8', 28800], // bare number = hours, the historical meaning
  ];
  for (const [raw, want] of cases) {
    process.env.JWT_EXPIRES_IN = raw;
    assert.equal(sessionTtlSeconds(), want, raw);
  }
  process.env.JWT_EXPIRES_IN = 'nonsense';
  assert.equal(sessionTtlSeconds(), PLATFORM_IDLE_SECONDS, 'falls back to the platform window');
  delete process.env.JWT_EXPIRES_IN;
});

/**
 * The defaults are the policy. An unset JWT_EXPIRES_IN used to mean twelve
 * hours, which quietly outlived the SchoolOS session this app's own is handed
 * down from — a deployment that set nothing was wrong by default.
 */
test('unset session settings default to the platform policy, not to something longer', () => {
  delete process.env.JWT_EXPIRES_IN;
  delete process.env.SESSION_MAX_HOURS;
  assert.equal(sessionTtlSeconds(), PLATFORM_IDLE_SECONDS, 'idle window matches SchoolOS');
  assert.ok(
    sessionTtlSeconds() <= PLATFORM_IDLE_SECONDS,
    'our idle window may never outlast the platform it depends on',
  );
  assert.equal(sessionMaxSeconds(), 8 * 3600, 'absolute cap matches SESSION_ABSOLUTE_HOURS');
});

/**
 * The expiry hint is read by JavaScript on purpose — that is what makes an
 * activity-gated renewal possible without asking the server (which would itself
 * be activity). Everything else about it must match the token it describes.
 */
test('the expiry hint cookie is readable, and otherwise identical to the token cookie', () => {
  process.env.JWT_EXPIRES_IN = '15m';
  const session = sessionCookieOptions();
  const hint = expCookieOptions();
  assert.equal(session.httpOnly, true, 'the token is never readable');
  assert.equal(hint.httpOnly, false, 'the hint always is');
  assert.deepEqual(
    { ...hint, httpOnly: session.httpOnly },
    session,
    'httpOnly is the only difference — they must die together, in every sense',
  );
  assert.equal(hint.secure, session.secure);
  assert.equal(hint.sameSite, session.sameSite);
  assert.equal(hint.path, session.path);
  delete process.env.JWT_EXPIRES_IN;
});

test('how a session was obtained survives a renewal', async () => {
  const born = Math.floor(Date.now() / 1000) - 600;
  // Only an SSO session has a SchoolOS session standing behind it. Lose `via`
  // on renewal and the browser stops keeping that one alive — the teacher is
  // signed out of the rest of the platform while still working here.
  const claims = await verifySession(await createSession({ ...user, via: 'sso' }, born));
  assert.ok(claims);
  assert.equal(claims.via, 'sso');
});

test('whose SchoolOS session this one came from survives a renewal', async () => {
  const born = Math.floor(Date.now() / 1000) - 600;
  const first = await verifySession(
    await createSession({ ...user, via: 'sso', ssoSub: 'T00116' }, born),
  );
  assert.ok(first);

  // Renew the way the middleware and /api/auth/renew both do it. Drop `ssoSub`
  // here and the browser loses the only thing it can compare the live SchoolOS
  // session against — the session silently becomes uncheckable again, and the
  // next person to sign in on this machine gets served this one's pages.
  const renewed = await verifySession(await createSession(identityOf(first), first.bornAt));
  assert.ok(renewed);
  assert.equal(renewed.ssoSub, 'T00116');
  assert.equal(renewed.bornAt, born);
});

test('identityOf keeps the identity and drops the clocks', async () => {
  const claims = await verifySession(await createSession({ ...user, via: 'sso', ssoSub: 'T1' }));
  assert.ok(claims);
  const identity = identityOf(claims);
  // A renewal mints iat/exp fresh; carrying the old ones over would re-sign a
  // token that expires at the moment the last one did.
  assert.ok(!('iat' in identity) && !('exp' in identity) && !('bornAt' in identity));
  assert.equal(identity.sub, 'person:1');
  assert.equal(identity.personId, 1);
});

/**
 * The bug this pins: our cookie used to carry a Max-Age, so it survived the
 * browser closing while the SchoolOS cookie it depends on did not. Sign in,
 * close everything, and the next person at that machine was walked into the
 * previous person's account — the login page saw a valid session and sent them
 * straight to its dashboard.
 */
test('the session cookies die with the browser', () => {
  process.env.JWT_EXPIRES_IN = '3h';
  for (const [what, opts] of [
    ['token', sessionCookieOptions()],
    ['expiry hint', expCookieOptions()],
  ] as const) {
    assert.ok(!('maxAge' in opts), `${what}: no Max-Age, or it outlives the browser`);
    assert.ok(!('expires' in opts), `${what}: no Expires, for the same reason`);
  }
  // And the lifetime still exists — it just lives in the token alone now.
  assert.equal(sessionTtlSeconds(), 3 * 3600);
  delete process.env.JWT_EXPIRES_IN;
});

test('the cookie is Secure unless a deployment explicitly opts out', () => {
  delete process.env.COOKIE_SECURE;
  assert.equal(sessionCookieOptions().secure, true, 'default');
  process.env.COOKIE_SECURE = 'true';
  assert.equal(sessionCookieOptions().secure, true);
  process.env.COOKIE_SECURE = 'false';
  assert.equal(sessionCookieOptions().secure, false, 'plain-HTTP LAN');
  delete process.env.COOKIE_SECURE;
});

test('a token round-trips, and carries the original login time', async () => {
  const token = await createSession(user);
  const claims = await verifySession(token);
  assert.ok(claims);
  assert.equal(claims.sub, 'person:1');
  assert.equal(claims.role, 'teacher');
  assert.equal(claims.personId, 1);
  assert.equal(typeof claims.bornAt, 'number');
  assert.equal(claims.bornAt, claims.iat);
});

test('a renewed token keeps bornAt from the original login', async () => {
  const born = Math.floor(Date.now() / 1000) - 3600;
  const claims = await verifySession(await createSession(user, born));
  assert.ok(claims);
  assert.equal(claims.bornAt, born, 'renewal must not restart the absolute clock');
});

test('garbage, and anything signed with another key, is not a session', async () => {
  assert.equal(await verifySession('not-a-token'), null);
  const good = await createSession(user);
  assert.equal(await verifySession(`${good}x`), null);
});

test('renewal waits until the token is past half its life', async () => {
  process.env.JWT_EXPIRES_IN = '10h';
  const now = Math.floor(Date.now() / 1000);
  const base = { ...user, exp: now + 36000, bornAt: now - 3600 };
  assert.equal(shouldRenew({ ...base, iat: now - 3600 }), false, '1h into 10h');
  assert.equal(shouldRenew({ ...base, iat: now - 5 * 3600 }), true, '5h into 10h');
  delete process.env.JWT_EXPIRES_IN;
});

test('the absolute cap ends a session however busy it has been', async () => {
  process.env.SESSION_MAX_HOURS = '24';
  const now = Math.floor(Date.now() / 1000);

  // Issued seconds ago, but the login behind it was 25 hours back.
  const stale = await createSession(user, now - 25 * 3600);
  assert.equal(await verifySession(stale), null, 'past the cap');

  const fresh = await createSession(user, now - 23 * 3600);
  assert.ok(await verifySession(fresh), 'inside the cap');

  // No point renewing a token that the cap is about to kill anyway.
  assert.equal(
    shouldRenew({ ...user, iat: now - 20 * 3600, exp: now + 3600, bornAt: now - 24 * 3600 }),
    false,
  );
  delete process.env.SESSION_MAX_HOURS;
});

/** An SSO session, which is the only kind that can be `pwa`. */
const PWA_USER = { ...user, via: 'sso' as const, ssoSub: 'T00116' };

/**
 * Trap 4.19, which is the expensive sibling of the one above.
 *
 * `client` and `capAt` are what size the next token's clocks. Drop either on a
 * renewal and the phone's session is re-minted as a fifteen-minute desktop one —
 * so the thing that exists to keep somebody signed in becomes the thing that
 * signs them out, on their first navigation, and only after it has worked
 * correctly for a while. Read from the outside that is "my phone is fine for a
 * bit and then starts logging me out every fifteen minutes", which is close to
 * unfindable without this test.
 */
test('an installed app stays an installed app across a renewal', async () => {
  const born = Math.floor(Date.now() / 1000) - 600;
  const cap = Date.now() + 14 * 24 * 3600 * 1000;
  const first = await verifySession(
    await createSession({ ...PWA_USER, client: 'pwa', capAt: cap }, born),
  );
  assert.ok(first);
  assert.equal(first.client, 'pwa');
  assert.equal(first.capAt, cap);

  // Renewed exactly as the middleware and /api/auth/renew do it — through
  // identityOf, which is the only reason those call sites cannot disagree.
  const renewed = await verifySession(await createSession(identityOf(first), first.bornAt));
  assert.ok(renewed);
  assert.equal(renewed.client, 'pwa', 'a renewed pwa session must not become a web one');
  assert.equal(renewed.capAt, cap, 'the platform ceiling must not be recomputed as ours');
  assert.equal(renewed.ssoSub, 'T00116');
  assert.ok(
    renewed.exp - Math.floor(Date.now() / 1000) > 24 * 3600,
    'the renewed window must still be days, not the fifteen-minute one',
  );
});

/**
 * `null` and `undefined` are opposite answers and the whole reason `capAt` is
 * copied rather than defaulted anywhere on its way in. `null` is the platform
 * saying "this session has no ceiling" — the normal case for an installed app.
 * `undefined` is an older Users Service that said nothing, which must fall back
 * to our own eight hours rather than silently becoming a session that never
 * ends.
 */
test('no ceiling and no answer are not the same thing', async () => {
  const longAgo = Math.floor(Date.now() / 1000) - 25 * 3600;

  const uncapped = await verifySession(
    await createSession({ ...PWA_USER, client: 'pwa', capAt: null }, longAgo),
  );
  assert.ok(uncapped, 'capAt:null means the platform put no ceiling on it');

  const silent = await createSession({ ...PWA_USER, client: 'pwa' }, longAgo);
  assert.equal(
    await verifySession(silent),
    null,
    'a token with no capAt at all falls back to our own eight hours',
  );
});

/**
 * The cookie half of the same bug (trap 4.20). An installed app is closed and
 * reopened all day; a cookie with no max-age is thrown away on every close, so
 * the user comes back to a system that has forgotten them while SchoolOS is
 * still perfectly signed in. A staffroom tab must keep the opposite behaviour:
 * closing the browser really does mean signed out.
 */
test('only an installed app gets a cookie that outlives the browser', () => {
  assert.equal(sessionCookieOptions().maxAge, undefined, 'default');
  assert.equal(sessionCookieOptions('web').maxAge, undefined, 'a shared machine');
  assert.equal(expCookieOptions('web').maxAge, undefined, 'the hint follows the token');

  const pwa = sessionCookieOptions('pwa');
  assert.ok(typeof pwa.maxAge === 'number' && pwa.maxAge > 24 * 3600, 'an installed app');
  assert.equal(expCookieOptions('pwa').maxAge, pwa.maxAge, 'the hint follows the token');
  assert.ok(pwa.maxAge <= 400 * 24 * 3600, 'asking for more than browsers keep is asking for 400');
});

/** A missing claim must fail towards the shorter window, never the longer one. */
test('a token that predates all this is read as a shared machine', () => {
  assert.equal(sessionTtlSeconds(undefined), sessionTtlSeconds('web'));
  assert.ok(sessionTtlSeconds('pwa') > sessionTtlSeconds('web'));
});

/**
 * Clamping exists to stop our session outliving the platform's, and for nothing
 * else. Clamping ourselves SHORTER than SchoolOS is trap 4.22: the phone is
 * signed out while the platform is still signed in, and no one looking at either
 * side can explain why.
 */
test('our own idle window never outlives the platform for either client', () => {
  process.env.SESSION_PWA_IDLE_DAYS = '9999';
  assert.equal(sessionTtlSeconds('pwa'), PLATFORM_PWA_IDLE_DAYS * 24 * 3600, 'clamped down');
  process.env.SESSION_PWA_IDLE_DAYS = '7';
  assert.equal(sessionTtlSeconds('pwa'), 7 * 24 * 3600, 'a school that wants shorter may say so');
  delete process.env.SESSION_PWA_IDLE_DAYS;
});

/**
 * Unverified on purpose, and only ever used to pick between two public pages: an
 * expired token cannot be verified, and this is the one question still worth
 * asking about one — whether the browser holding it belongs at the SchoolOS
 * front door or at our own login page (trap 4.21).
 */
test('an expired token still says which ending it deserves', async () => {
  const spent = Math.floor(Date.now() / 1000) - 25 * 3600;
  assert.equal(refusedClient(await createSession({ ...PWA_USER, client: 'pwa' }, spent)), 'pwa');
  assert.equal(refusedClient(await createSession({ ...PWA_USER, client: 'web' }, spent)), 'web');
  assert.equal(refusedClient(await createSession(PWA_USER, spent)), null, 'no client claim');
  assert.equal(refusedClient('not-a-token'), null);
});
