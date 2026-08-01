import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const KEYLEN = 64;

/**
 * Cost for new hashes. Node's default N is 16384; 65536 is roughly four times
 * the work per guess, which is the whole point of the parameter and is still
 * imperceptible on a login. `maxmem` has to be raised to match — 128·N·r is
 * over the 32 MB default at this N, and scrypt refuses rather than exceed it.
 */
const N = 65536;
const R = 8;
const P = 1;
const MAXMEM = 128 * N * R * 2;

/**
 * Hash a password as `scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>`.
 *
 * The older three-field form (`scrypt$salt$hash`, Node's default cost) is still
 * accepted by verifyPassword — a school that upgrades this app should not find
 * its ผู้ดูแล locked out — so the parameters travel in the string rather than
 * being implied by a constant that has since changed.
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(plain, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/** Constant-time verify against either stored form. */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts[0] !== 'scrypt') return false;

  let salt: Buffer;
  let expected: Buffer;
  let opts: { N: number; r: number; p: number; maxmem: number };

  if (parts.length === 6) {
    const [, n, r, p, saltHex, hashHex] = parts;
    const nn = Number(n);
    const rr = Number(r);
    if (!Number.isInteger(nn) || !Number.isInteger(rr) || nn <= 0 || rr <= 0) return false;
    salt = Buffer.from(saltHex, 'hex');
    expected = Buffer.from(hashHex, 'hex');
    opts = { N: nn, r: rr, p: Number(p) || 1, maxmem: 128 * nn * rr * 2 };
  } else if (parts.length === 3) {
    salt = Buffer.from(parts[1], 'hex');
    expected = Buffer.from(parts[2], 'hex');
    opts = { N: 16384, r: 8, p: 1, maxmem: 128 * 16384 * 8 * 2 };
  } else {
    return false;
  }

  let derived: Buffer;
  try {
    derived = await scrypt(plain, salt, expected.length || KEYLEN, opts);
  } catch {
    return false;
  }
  if (derived.length !== expected.length || expected.length === 0) return false;
  return timingSafeEqual(derived, expected);
}

/** True when a stored hash uses the older, cheaper form and is worth re-hashing. */
export function needsRehash(stored: string): boolean {
  const parts = stored.split('$');
  return parts[0] === 'scrypt' && parts.length === 3;
}
