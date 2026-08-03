/**
 * The two cookie names, and nothing else.
 *
 * Split out so the browser can name them without importing session-core, which
 * pulls in `jose` — a signing library has no business in a client bundle just
 * because a component needed to know what a cookie is called. The alternative
 * was a string literal in the component, which is the same name written twice
 * and eventually two different names.
 */

/** The session token itself. httpOnly — JavaScript can never read this one. */
export const SESSION_COOKIE = 'tracks_session';

/**
 * Companion cookie holding only the moment the session dies (epoch ms), left
 * readable on purpose: SessionKeeper has to know how long is left WITHOUT
 * asking the server, since asking would itself be the activity that resets it.
 * It carries no credential and the server never trusts it.
 */
export const SESSION_EXP_COOKIE = 'tracks_session_exp';
