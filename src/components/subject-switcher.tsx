'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Select } from './ui';

export interface SwitchSubject {
  id: number;
  code: string;
  name: string;
  groupCode: string;
}

/** A subject dropdown that reflects the current `?subject=` and navigates on change. */
export function SubjectSwitcher({
  subjects,
  current,
}: {
  subjects: SwitchSubject[];
  current: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function go(id: string) {
    const next = new URLSearchParams(params);
    next.set('subject', id);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <Select
      value={current ?? ''}
      onChange={(e) => go(e.target.value)}
      className="h-10 max-w-md"
    >
      {subjects.map((s) => (
        <option key={s.id} value={s.id}>
          {s.groupCode} · {s.code} — {s.name}
        </option>
      ))}
    </Select>
  );
}
