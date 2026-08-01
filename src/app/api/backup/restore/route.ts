import { NextResponse, type NextRequest } from 'next/server';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { currentUser } from '@/lib/authz';
import { logActivity } from '@/lib/log';
import { newUploadSlot, restoreUploaded } from '@/lib/backup';

export const runtime = 'nodejs';

/** Same ceiling the page advertises. Enforced while streaming, not after. */
const MAX_BYTES = 200 * 1024 * 1024;

/**
 * POST /api/backup/restore — upload a pg_dump archive and restore it.
 *
 * A route handler rather than a server action because of how the bytes travel:
 * an action buffers the whole body in memory and needs the global
 * `serverActions.bodySizeLimit` raised to 200 MB for every action in the app.
 * Here the upload goes straight to a private temp file, the app's memory never
 * holds the archive, and the limit stops the transfer the moment it is exceeded
 * instead of after the last byte has arrived.
 *
 * Destructive and admin-only: pg_restore --clean drops and rewrites every
 * table, and it executes whatever SQL the archive contains under this app's
 * database role. There is no way to make an arbitrary uploaded dump safe, so
 * the page states plainly what the button does.
 */
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user || user.role !== 'admin')
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (!req.body) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 });

  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES)
    return NextResponse.json({ error: 'ไฟล์ใหญ่เกิน 200MB' }, { status: 413 });

  const slot = await newUploadSlot();
  try {
    let written = 0;
    const source = Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]);
    source.on('data', (chunk: Buffer) => {
      written += chunk.length;
      if (written > MAX_BYTES) source.destroy(new Error('too large'));
    });
    await pipeline(source, createWriteStream(slot.path));
    if (written === 0) return NextResponse.json({ error: 'ไฟล์ว่างเปล่า' }, { status: 400 });

    // Headers are Latin-1, so the client percent-encodes the (possibly Thai)
    // filename. It is only ever used as an audit-log label.
    const raw = req.headers.get('x-file-name');
    let name = 'upload.dump';
    try {
      if (raw) name = decodeURIComponent(raw).slice(0, 200);
    } catch {
      /* keep the default */
    }
    await restoreUploaded(slot.path);
    await logActivity(user, 'restore_upload', name, { size: written });
    return NextResponse.json({ ok: true, message: `กู้คืนจากไฟล์ ${name} สำเร็จ` });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'error';
    return NextResponse.json(
      { error: message === 'too large' ? 'ไฟล์ใหญ่เกิน 200MB' : `กู้คืนไม่สำเร็จ: ${message}` },
      { status: message === 'too large' ? 413 : 500 },
    );
  } finally {
    await slot.cleanup();
  }
}
