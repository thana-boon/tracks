import 'server-only';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, stat, unlink, readFile, writeFile } from 'node:fs/promises';
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

function dbUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return url;
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
  // -Fc custom format, --no-owner so a restore doesn't fight role ownership.
  await run('pg_dump', ['-Fc', '--no-owner', '--no-privileges', '-f', path, dbUrl()], {
    maxBuffer: 1024 * 1024 * 64,
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

/** Restore from an existing backup file. Destructive: --clean --if-exists. */
export async function restoreBackup(name: string): Promise<void> {
  if (!isValidBackupName(name)) throw new Error('bad name');
  const path = join(dir(), name);
  await stat(path); // throws if missing
  await run(
    'pg_restore',
    ['--clean', '--if-exists', '--no-owner', '--no-privileges', '-d', dbUrl(), path],
    { maxBuffer: 1024 * 1024 * 64 },
  );
}

/** Restore from an uploaded custom-format archive (written to a temp file first). */
export async function restoreFromBuffer(buffer: Buffer): Promise<void> {
  const tmp = join(tmpdir(), `tracks-restore-${Date.now()}.dump`);
  await writeFile(tmp, buffer);
  try {
    await run(
      'pg_restore',
      ['--clean', '--if-exists', '--no-owner', '--no-privileges', '-d', dbUrl(), tmp],
      { maxBuffer: 1024 * 1024 * 64 },
    );
  } finally {
    await unlink(tmp).catch(() => {});
  }
}
