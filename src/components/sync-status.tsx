import { CheckCircle2, AlertTriangle, Clock, RefreshCw, Zap, ZapOff } from 'lucide-react';
import { Card, Badge } from '@/components/ui';
import { thaiDateTimeLongOf, thaiRelativeTime } from '@/lib/utils';
import {
  autoSyncIntervalMinutes,
  SYNC_KINDS,
  SYNC_KIND_LABEL,
  type SyncKind,
  type SyncStateRow,
} from '@/lib/auto-sync';

/** "ทุก 6 ชั่วโมง" / "ทุก 45 นาที" from a minute count. */
export function intervalLabel(minutes: number): string {
  if (minutes <= 0) return 'ปิดอยู่';
  if (minutes % 1440 === 0) return `ทุก ${minutes / 1440} วัน`;
  if (minutes % 60 === 0) return `ทุก ${minutes / 60} ชั่วโมง`;
  return `ทุก ${minutes} นาที`;
}

/**
 * What the background sync has been doing. The sync runs unattended, so this is
 * the only place its work is visible — every row says when it last ran, whether
 * it worked, and whether a person or the scheduler started it.
 *
 * `only` narrows it to one kind, which is how the ปีการศึกษา screen shows just
 * its own row without repeating the whole roster.
 */
export function SyncStatus({
  state,
  only,
}: {
  state: Map<SyncKind, SyncStateRow>;
  only?: SyncKind[];
}) {
  const minutes = autoSyncIntervalMinutes();
  const on = minutes > 0;
  const kinds = only ?? [...SYNC_KINDS];
  // Always off the whole map, never just the rows on screen: the scheduler is
  // armed on the newest run of *any* kind, and the estimate must match it.
  const next = nextRunAt(state, minutes);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-secondary/30 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <span
            className={`grid size-8 place-items-center rounded-lg ${
              on ? 'bg-success/10 text-success' : 'bg-secondary text-muted-foreground'
            }`}
          >
            {on ? (
              <Zap className="size-4.5" strokeWidth={1.8} />
            ) : (
              <ZapOff className="size-4.5" strokeWidth={1.8} />
            )}
          </span>
          <div>
            <p className="text-sm font-semibold">
              {on ? 'ซิงก์อัตโนมัติทำงานอยู่' : 'ซิงก์อัตโนมัติปิดอยู่'}
            </p>
            <p className="text-xs text-muted-foreground">
              {on
                ? `ระบบดึงข้อมูลจาก SchoolOS เองทุกครั้งที่ถึงรอบ · ${intervalLabel(minutes)}`
                : 'ตั้ง AUTO_SYNC_INTERVAL_MINUTES ใน .env แล้วรีสตาร์ทเพื่อเปิดใช้งาน'}
            </p>
          </div>
        </div>
        {on ? (
          <Badge tone="secondary" className="shrink-0">
            <Clock className="size-3.5" strokeWidth={2} />
            รอบถัดไป {next ? thaiRelativeTime(next) : 'เร็ว ๆ นี้'}
          </Badge>
        ) : null}
      </div>

      <ul className="divide-y divide-border/60">
        {kinds.map((kind) => {
          const row = state.get(kind);
          return (
            <li key={kind} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              <span className="shrink-0">
                {!row ? (
                  <RefreshCw className="size-4 text-muted-foreground" strokeWidth={1.8} />
                ) : row.ok ? (
                  <CheckCircle2 className="size-4 text-success" strokeWidth={1.8} />
                ) : (
                  <AlertTriangle className="size-4 text-destructive" strokeWidth={1.8} />
                )}
              </span>
              <span className="w-28 shrink-0 text-sm font-medium">{SYNC_KIND_LABEL[kind]}</span>
              <span
                className={`min-w-0 flex-1 truncate text-xs ${
                  row && !row.ok ? 'text-destructive' : 'text-muted-foreground'
                }`}
                title={row?.message ?? undefined}
              >
                {row ? row.message ?? '—' : 'ยังไม่เคยซิงก์'}
              </span>
              {row ? (
                <span
                  className="hidden shrink-0 text-xs text-muted-foreground sm:inline"
                  title={thaiDateTimeLongOf(row.ranAt)}
                >
                  {row.trigger === 'auto' ? 'อัตโนมัติ' : 'กดเอง'} ·{' '}
                  {thaiRelativeTime(row.ranAt)}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/**
 * When the scheduler is next due. It is armed off the newest run of any kind
 * (that is the same clock `isDue` reads), so the estimate matches what the
 * server will actually do.
 */
function nextRunAt(state: Map<SyncKind, SyncStateRow>, minutes: number): Date | null {
  if (minutes <= 0) return null;
  let newest: number | null = null;
  for (const row of state.values()) {
    const t = row.ranAt.getTime();
    if (newest === null || t > newest) newest = t;
  }
  return newest === null ? null : new Date(newest + minutes * 60_000);
}
