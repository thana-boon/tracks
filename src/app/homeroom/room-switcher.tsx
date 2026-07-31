import Link from 'next/link';
import { Users } from 'lucide-react';
import { Card, CardHeader, Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { Homeroom } from '@/lib/homeroom';

/**
 * Which ห้อง the page is showing — one click, one room. Deliberately separate
 * from the export panel: an admin flicking between rooms should never have to
 * untick the room they were just looking at.
 */
export function RoomSwitcher({ rooms, current }: { rooms: Homeroom[]; current: string }) {
  return (
    <Card>
      <CardHeader
        icon={<Users className="size-4.5" strokeWidth={1.8} />}
        title="เลือกห้องที่จะดู"
        action={<Badge tone="secondary">{rooms.length} ห้องทั้งหมด</Badge>}
      />
      <div className="px-4 pb-4 sm:px-5">
        <ul className="flex flex-wrap gap-2">
          {rooms.map((r) => {
            const on = r.key === current;
            return (
              <li key={r.key}>
                <Link
                  href={`/homeroom?room=${encodeURIComponent(r.key)}`}
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
