import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { people } from '@/db/schema';
import { getSession } from '@/lib/session';
import { schoolos } from '@/lib/schoolos';

/**
 * Account photo proxy: /api/photo/<people.id> → the Users Service photo of that
 * person. The browser can never call the Users Service itself (the API key is
 * server-only), so every avatar goes through here. 404 means "no photo" — the
 * avatar component falls back to the initial on it.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ personId: string }> },
) {
  const user = await getSession();
  if (!user) return new Response(null, { status: 401 });

  const personId = Number((await params).personId);
  if (!Number.isInteger(personId)) return new Response(null, { status: 400 });

  const [person] = await db
    .select({ type: people.type, schoolosId: people.schoolosId })
    .from(people)
    .where(eq(people.id, personId))
    .limit(1);
  if (!person) return new Response(null, { status: 404 });

  let upstream: Response;
  try {
    upstream = await schoolos.photo(person.type, person.schoolosId);
  } catch {
    return new Response(null, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) return new Response(null, { status: 404 });

  return new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'image/webp',
      // Private: a photo is personal, and the session cookie gates it.
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
