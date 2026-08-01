import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSession,
  verifySession,
  sessionTtlSeconds,
  shouldRenew,
  sessionCookieOptions,
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
  assert.equal(sessionTtlSeconds(), 43200, 'falls back to 12h');
  delete process.env.JWT_EXPIRES_IN;
});

test('the cookie outlives the token by exactly nothing', () => {
  process.env.JWT_EXPIRES_IN = '3h';
  assert.equal(sessionCookieOptions().maxAge, sessionTtlSeconds());
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
