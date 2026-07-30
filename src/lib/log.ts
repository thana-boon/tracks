import 'server-only';
import { db } from '@/db';
import { activityLogs } from '@/db/schema';
import { actorOf } from './authz';
import type { SessionUser } from './session';

/**
 * Append one activity-log row. Best-effort: an audit failure must never abort
 * the action it describes, so errors are logged and swallowed.
 */
export async function logActivity(
  user: SessionUser,
  action: string,
  target?: string,
  detail?: Record<string, unknown> | object,
): Promise<void> {
  try {
    await db.insert(activityLogs).values({
      actor: actorOf(user),
      actorName: user.name,
      action,
      target: target ?? null,
      detail: detail ?? null,
    });
  } catch (e) {
    console.warn('[log] activity log failed:', e instanceof Error ? e.message : e);
  }
}
