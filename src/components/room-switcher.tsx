import Link from 'next/link';
import { Users } from 'lucide-react';
import { Card, CardHeader, Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface SwitchRoom {
  /** "ม.5/2" */
  key: string;
  studentCount: number;
}

/**
 * Which ห้อง a page is showing — one click, one room, carried in `?room=`.
 *
 * Shared by เวลาเข้าเรียน and ห้องที่ปรึกษา, and deliberately kept separate from
 * the PDF export's own tick list: flicking between rooms to read them should
 * never disturb a batch someone is assembling to print.
 */
export function RoomSwitcher({
  rooms,
  current,
  basePath,
  title = 'เลือกห้องที่จะดู',
}: {
  rooms: SwitchRoom[];
  current: string;
  /** where a room click navigates, e.g. "/results" */
  basePath: string;
  title?: string;
}) {
  return (
    <Card>
      <CardHeader
        icon={<Users className="size-4.5" strokeWidth={1.8} />}
        title={title}
        action={<Badge tone="secondary">{rooms.length} ห้อง</Badge>}
      />
      <div className="px-4 pb-4 sm:px-5">
        <ul className="flex flex-wrap gap-2">
          {rooms.map((r) => {
            const on = r.key === current;
            return (
              <li key={r.key}>
                <Link
                  href={`${basePath}?room=${encodeURIComponent(r.key)}`}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'block rounded-xl border px-3 py-2 text-sm transition-colors',
                    on
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card hover:bg-secondary/60',
                  )}
                >
                  <span className="font-medium">ห้อง {r.key}</span>
                  <span
                    className={cn(
                      'block text-[11px]',
                      on ? 'text-primary-foreground/75' : 'text-muted-foreground',
                    )}
                  >
                    {r.studentCount} คน
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
