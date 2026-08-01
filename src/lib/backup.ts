import 'server-only';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readdir, rm, stat, unlink, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';

const run = promisify(execFile);

/**
 * pg_dump / pg_restore wrappers for the in-app backup page (admin only, spec
 * §4.7). Archives use the custom format (-Fc) so restore can --clean the schema
 * first. Everything targets DATABASE_URL — the same external postgres-core the
 * app already uses; no new database is ever created.
 */

function dir(): string {
  return process.env.BACKUP_DIR?.trim() || join(process.cwd(), 'backups');
}

/**
 * The connection for pg_dump/pg_restore, with the password moved out of argv.
 *
 * A command's arguments are readable by anything that can list processes, so
 * passing the whole DATABASE_URL as one put the database password on show for
 * the length of every dump. libpq reads PGPASSWORD from the environment
 * instead, which is not; the URI keeps everything else.
 */
function connection(): { uri: string; env: NodeJS.ProcessEnv } {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is not set');
  try {
    const url = new URL(raw);
    const password = decodeURIComponent(url.password);
    if (!password) return { uri: raw, env: process.env };
    url.password = '';
    return { uri: url.toString(), env: { ...process.env, PGPASSWORD: password } };
  } catch {
    // Not a URL we can parse (a libpq key=value string, say) — hand it over
    // untouched rather than refusing to back the database up.
    return { uri: raw, env: process.env };
  }
}

/** A backup filename must be a plain timestamped .dump — never a path. */
const NAME_RE = /^tracks-\d{8}-\d{6}\.dump$/;
export function isValidBackupName(name: string): boolean {
  return NAME_RE.test(name) && basename(name) === name;
}

export interface BackupFile {
  name: string;
  size: number;
  createdAt: Date;
}

export async function listBackups(): Promise<BackupFile[]> {
  const d = dir();
  await mkdir(d, { recursive: true });
  const names = (await readdir(d)).filter(isValidBackupName);
  const files = await Promise.all(
    names.map(async (name) => {
      const st = await stat(join(d, name));
      return { name, size: st.size, createdAt: st.mtime };
    }),
  );
  return files.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

function stamp(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export async function createBackup(): Promise<BackupFile> {
  const d = dir();
  await mkdir(d, { recursive: true });
  const name = `tracks-${stamp()}.dump`;
  const path = join(d, name);
  const { uri, env } = connection();
  // -Fc custom format, --no-owner so a restore doesn't fight role ownership.
  await run('pg_dump', ['-Fc', '--no-owner', '--no-privileges', '-f', path, uri], {
    maxBuffer: 1024 * 1024 * 64,
    env,
  });
  const st = await stat(path);
  return { name, size: st.size, createdAt: st.mtime };
}

export async function deleteBackup(name: string): Promise<void> {
  if (!isValidBackupName(name)) throw new Error('bad name');
  await unlink(join(dir(), name));
}

export async function readBackup(name: string): Promise<Buffer> {
  if (!isValidBackupName(name)) throw new Error('bad name');
  return readFile(join(dir(), name));
}

/** Run pg_restore against an archive already on disk. Destructive: --clean. */
async function pgRestore(path: string): Promise<void> {
  const { uri, env } = connection();
  await run(
    'pg_restore',
    ['--clean', '--if-exists', '--no-owner', '--no-privileges', '-d', uri, path],
    { maxBuffer: 1024 * 1024 * 64, env },
  );
}

/** Restore from an existing backup file. Destructive: --clean --if-exists. */
export async function restoreBackup(name: string): Promise<void> {
  if (!isValidBackupName(name)) throw new Error('bad name');
  const path = join(dir(), name);
  await stat(path); // throws if missing
  await pgRestore(path);
}

/**
 * A private directory for one uploaded archive, and its cleanup.
 *
 * mkdtemp rather than a name built from the clock: the old
 * `tracks-restore-<Date.now()>.dump` was guessable, and a guessable path in a
 * shared /tmp is a file anything else on the box can get in front of. The
 * caller streams the upload into `path`, then calls restoreUploaded().
 */
export async function newUploadSlot(): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const base = await mkdtemp(join(tmpdir(), 'tracks-restore-'));
  return {
    path: join(base, 'upload.dump'),
    cleanup: () => rm(base, { recursive: true, force: true }).catch(() => {}),
  };
}

/** Restore from an uploaded custom-format archive written by newUploadSlot(). */
export async function restoreUploaded(path: string): Promise<void> {
  await stat(path); // throws if the upload never landed
  await pgRestore(path);
}
