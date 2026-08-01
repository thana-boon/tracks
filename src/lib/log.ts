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
  return logEvent(actorOf(user), user.name, action, target, detail);
}

/**
 * The same row, for something that happened without a session behind it.
 *
 * A failed login is the case this exists for: it has no SessionUser by
 * definition, which is why nothing used to record it — so a run of guesses
 * against the ผู้ดูแล account left no trace at all, and only the successful one
 * showed up in the log.
 */
export async function logEvent(
  actor: string,
  actorName: string,
  action: string,
  target?: string,
  detail?: Record<string, unknown> | object,
): Promise<void> {
  try {
    await db.insert(activityLogs).values({
      actor,
      actorName,
      action,
      target: target ?? null,
      detail: detail ?? null,
    });
  } catch (e) {
    console.warn('[log] activity log failed:', e instanceof Error ? e.message : e);
  }
}
