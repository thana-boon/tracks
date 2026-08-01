import 'server-only';
import { desc } from 'drizzle-orm';
import { db } from '@/db';
import { syncState } from '@/db/schema';
import { syncYears, syncStudents, syncTeachers, syncHomerooms, type SyncCounts } from './sync';
import { forgetAlumni } from './alumni';
import { activeYear } from './years';

/**
 * ซิงก์อัตโนมัติ — the roster keeps itself current instead of waiting for an
 * admin to press four buttons in the right order.
 *
 * The order is not cosmetic: homerooms reference teachers by SchoolOS id and
 * hang off the active year, so years → students → teachers → homerooms is the
 * only sequence in which a cold database ends up complete. `runFullSync` is
 * that sequence; the manual buttons still call the individual steps.
 *
 * A run is skipped rather than queued when one is already going (see `running`)
 * — the scheduler ticking while a slow sync is mid-flight must not double the
 * load on the Users Service. State is written per kind to `sync_state` so the
 * screens can show what the background did while nobody was watching.
 */

export const SYNC_KINDS = ['years', 'students', 'teachers', 'homerooms'] as const;
export type SyncKind = (typeof SYNC_KINDS)[number];

export const SYNC_KIND_LABEL: Record<SyncKind, string> = {
  years: 'ปีการศึกษา',
  students: 'นักเรียน ม.4-6',
  teachers: 'ครู',
  homerooms: 'ครูที่ปรึกษา',
};

export type SyncTrigger = 'auto' | 'manual';

export interface SyncOutcome {
  kind: SyncKind;
  ok: boolean;
  message: string;
  counts?: SyncCounts;
}

export interface SyncStateRow {
  kind: SyncKind;
  trigger: SyncTrigger;
  ok: boolean;
  message: string | null;
  detail: unknown;
  durationMs: number | null;
  ranAt: Date;
}

/** Default cadence — six hours is enough for a roster that changes by the term. */
const DEFAULT_INTERVAL_MINUTES = 360;

/** `AUTO_SYNC_INTERVAL_MINUTES` minutes between runs; 0 (or less) turns it off. */
export function autoSyncIntervalMinutes(): number {
  const raw = process.env.AUTO_SYNC_INTERVAL_MINUTES;
  if (raw === undefined || raw.trim() === '') return DEFAULT_INTERVAL_MINUTES;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // A floor of 5 minutes: a typo like "1" must not hammer the Users Service.
  return Math.max(5, Math.round(n));
}

export function autoSyncEnabled(): boolean {
  return autoSyncIntervalMinutes() > 0;
}

async function recordState(
  kind: SyncKind,
  trigger: SyncTrigger,
  ok: boolean,
  message: string,
  detail: object | undefined,
  durationMs: number,
): Promise<void> {
  try {
    await db
      .insert(syncState)
      .values({ kind, trigger, ok, message, detail: detail ?? null, durationMs })
      .onConflictDoUpdate({
        target: syncState.kind,
        set: { trigger, ok, message, detail: detail ?? null, durationMs, ranAt: new Date() },
      });
  } catch (e) {
    // Bookkeeping must never fail the sync it describes.
    console.warn('[sync] state write failed:', e instanceof Error ? e.message : e);
  }
}

function countsMessage(kind: SyncKind, c: SyncCounts): string {
  if (kind === 'homerooms') return `${c.created} รายการ (พบจาก API ${c.total})`;
  return `เพิ่ม ${c.created}, ปรับปรุง ${c.updated} (ทั้งหมด ${c.total})`;
}

/**
 * Run one step and record its outcome. Never throws — a failed step is a
 * recorded failure, so an unreachable Users Service leaves the app running and
 * the reason visible on screen.
 */
export async function runSyncStep(kind: SyncKind, trigger: SyncTrigger): Promise<SyncOutcome> {
  const started = Date.now();
  try {
    let counts: SyncCounts;
    if (kind === 'years') {
      counts = await syncYears();
    } else if (kind === 'students') {
      counts = await syncStudents();
      // จบการศึกษา / ลาออก is decided by this step, so it is the one thing that
      // can change who the alumni pages list.
      forgetAlumni();
    } else if (kind === 'teachers') {
      counts = await syncTeachers();
    } else {
      const year = await activeYear();
      if (!year) throw new Error('ยังไม่มีปีการศึกษาที่ใช้งาน — ซิงก์ปีก่อน');
      counts = await syncHomerooms(year.id, year.schoolosId);
    }
    const message = countsMessage(kind, counts);
    await recordState(kind, trigger, true, message, counts, Date.now() - started);
    return { kind, ok: true, message, counts };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'error';
    await recordState(kind, trigger, false, message, undefined, Date.now() - started);
    return { kind, ok: false, message };
  }
}

let running = false;

/** True while a full sync is in flight — the UI disables its button on it. */
export function syncInProgress(): boolean {
  return running;
}

/**
 * The whole roster, in dependency order. Later steps still run when an earlier
 * one fails: a Users Service that is briefly missing `years:read` scope should
 * not also stop the student list from refreshing.
 */
export async function runFullSync(trigger: SyncTrigger): Promise<SyncOutcome[]> {
  if (running) return [];
  running = true;
  try {
    const out: SyncOutcome[] = [];
    for (const kind of SYNC_KINDS) out.push(await runSyncStep(kind, trigger));
    return out;
  } finally {
    running = false;
  }
}

/** Last recorded run of each kind, indexed by kind. */
export async function readSyncState(): Promise<Map<SyncKind, SyncStateRow>> {
  const rows = await db.select().from(syncState).orderBy(desc(syncState.ranAt));
  const by = new Map<SyncKind, SyncStateRow>();
  for (const r of rows) {
    if ((SYNC_KINDS as readonly string[]).includes(r.kind))
      by.set(r.kind as SyncKind, r as SyncStateRow);
  }
  return by;
}

/** The most recent run of any kind — "ซิงก์ล่าสุดเมื่อ …" on the dashboard. */
export async function lastSyncAt(): Promise<Date | null> {
  const [row] = await db
    .select({ ranAt: syncState.ranAt })
    .from(syncState)
    .orderBy(desc(syncState.ranAt))
    .limit(1);
  return row?.ranAt ?? null;
}

/**
 * Whether enough time has passed to sync again. Read from the database, not
 * from process memory, so a container that restarts every few minutes does not
 * re-sync every few minutes.
 */
async function isDue(intervalMinutes: number): Promise<boolean> {
  try {
    const last = await lastSyncAt();
    if (!last) return true;
    return Date.now() - last.getTime() >= intervalMinutes * 60_000;
  } catch {
    // No sync_state table yet (migration still running) — try, and let the
    // step itself record whatever happens.
    return true;
  }
}

let scheduled = false;

/**
 * Arm the background sync: one catch-up run shortly after boot (only if the
 * data is actually stale), then one run per interval. Called from
 * `instrumentation.ts`, so it is armed once per server process.
 */
export function startAutoSync(): void {
  if (scheduled) return;
  const minutes = autoSyncIntervalMinutes();
  if (minutes <= 0) {
    console.log('[sync] auto-sync disabled (AUTO_SYNC_INTERVAL_MINUTES=0)');
    return;
  }
  scheduled = true;

  const tick = async (reason: string) => {
    try {
      if (!(await isDue(minutes))) return;
      const out = await runFullSync('auto');
      if (out.length === 0) return; // another run had it
      const failed = out.filter((o) => !o.ok);
      if (failed.length === 0) console.log(`[sync] auto-sync ok (${reason})`);
      else
        console.warn(
          `[sync] auto-sync partial (${reason}):`,
          failed.map((f) => `${f.kind}: ${f.message}`).join(' · '),
        );
    } catch (e) {
      console.warn('[sync] auto-sync failed:', e instanceof Error ? e.message : e);
    }
  };

  // Give migrations and the DB pool a moment before the first hit.
  const boot = setTimeout(() => void tick('boot'), 20_000);
  const timer = setInterval(() => void tick('interval'), minutes * 60_000);
  boot.unref?.();
  timer.unref?.();
  console.log(`[sync] auto-sync armed — every ${minutes} min`);
}
