import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/session';
import { isValidBackupName, readBackup } from '@/lib/backup';

export const runtime = 'nodejs';

/** GET /api/backup/<name> — download a backup archive. Admin only. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const user = await getSession();
  if (!user || user.role !== 'admin')
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { name } = await params;
  if (!isValidBackupName(name))
    return NextResponse.json({ error: 'bad name' }, { status: 400 });

  try {
    const buffer = await readBackup(name);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${name}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
}
