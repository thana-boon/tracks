import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scrypt as scryptCb } from 'node:crypto';
import { promisify } from 'node:util';
import { hashPassword, needsRehash, verifyPassword } from './password';

const scrypt = promisify(scryptCb);

/** The pre-upgrade format, reproduced so the compatibility claim is tested. */
async function legacyHash(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(plain, salt, 64)) as Buffer;
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

test('a new hash verifies, and a wrong password does not', async () => {
  const stored = await hashPassword('ครูสมชาย-2569!');
  assert.equal(await verifyPassword('ครูสมชาย-2569!', stored), true);
  assert.equal(await verifyPassword('ครูสมชาย-2568!', stored), false);
  assert.equal(await verifyPassword('', stored), false);
});

test('new hashes carry their cost parameters', async () => {
  const stored = await hashPassword('x');
  const parts = stored.split('$');
  assert.equal(parts.length, 6);
  assert.equal(parts[0], 'scrypt');
  assert.equal(Number(parts[1]), 65536, 'N');
  assert.equal(needsRehash(stored), false);
});

test('an admin hashed by the previous version can still log in', async () => {
  const stored = await legacyHash('old-admin-password');
  assert.equal(await verifyPassword('old-admin-password', stored), true);
  assert.equal(await verifyPassword('nope', stored), false);
  assert.equal(needsRehash(stored), true, 'and is upgraded on that login');
});

test('a malformed stored hash is a failure, never a throw', async () => {
  for (const junk of ['', 'scrypt', 'scrypt$', 'bcrypt$a$b', 'scrypt$a$b$c$d', 'scrypt$0$8$1$aa$bb'])
    assert.equal(await verifyPassword('anything', junk), false, junk);
});
