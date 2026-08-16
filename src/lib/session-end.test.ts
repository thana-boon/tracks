import test from 'node:test';
import assert from 'node:assert/strict';

import { ENDED_PARAM, endedUrl, portalOf, sessionEndOf } from './session-end';

/**
 * Where a session that ended goes. The middleware, SessionGuard, SessionKeeper
 * and the login page all read this one answer, and the whole point of the file
 * is that they cannot disagree about it.
 */

test('a configured portal is the destination, whatever shape it was written in', () => {
  assert.equal(portalOf('https://schoolos.sukhon.ac.th'), 'https://schoolos.sukhon.ac.th');
  assert.equal(
    portalOf('  https://schoolos.sukhon.ac.th/  '),
    'https://schoolos.sukhon.ac.th',
    'a trailing slash from the .env is not a different portal',
  );
});

/**
 * "/" is what an unset SCHOOLOS_PORTAL_URL falls back to, and on a root-mounted
 * deploy that is this app's own front page. Sending a browser there instead of
 * to the portal is a loop, not a trip — so it has to read as "no portal".
 */
test('no portal is configured unless one really is', () => {
  assert.equal(portalOf('/'), null, 'the ssoConfig fallback is not a portal');
  assert.equal(portalOf('///'), null);
  assert.equal(portalOf('   '), null);
  assert.equal(portalOf(''), null);
  assert.equal(portalOf(undefined), null);
  assert.equal(portalOf(null), null);
});

test('a session that ends leaves for the portal, not for our own login form', () => {
  const portal = portalOf('https://schoolos.sukhon.ac.th');
  assert.equal(endedUrl('idle', portal), 'https://schoolos.sukhon.ac.th');
  assert.equal(endedUrl('sso', portal), 'https://schoolos.sukhon.ac.th');
});

/**
 * The fallback, and the only path that still carries a reason: a deployment
 * with no portal, or a local ผู้ดูแล, for whom this form IS the way back in.
 * `idle` must survive the trip — it is what holds silent SSO off for one window,
 * so the timeout that just happened is not immediately undone.
 */
test('with nowhere to go, the reason comes to the login page instead', () => {
  assert.equal(endedUrl('idle', null), `/login?${ENDED_PARAM}=idle`);
  assert.equal(endedUrl('sso', null), `/login?${ENDED_PARAM}=sso`);
});

test('only a reason we wrote is read back off the query string', () => {
  assert.equal(sessionEndOf('idle'), 'idle');
  assert.equal(sessionEndOf('sso'), 'sso');
  assert.equal(sessionEndOf('yes'), null);
  assert.equal(sessionEndOf(null), null);
  assert.equal(sessionEndOf(undefined), null);
});
