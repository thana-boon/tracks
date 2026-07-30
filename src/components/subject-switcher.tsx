'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Select } from './ui';

export interface SwitchSection {
  id: number;
  name: string;
  subjectCode: string;
  subjectName: string;
  groupCode: string;
}

/**
 * A รอบเรียน dropdown that reflects the current `?section=` and navigates on
 * change. Two รอบ of one วิชา differ only by their name, so the name is always
 * part of the label.
 */
export function SectionSwitcher({
  sections,
  current,
}: {
  sections: SwitchSection[];
  current: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function go(id: string) {
    const next = new URLSearchParams(params);
    next.set('section', id);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <Select value={current ?? ''} onChange={(e) => go(e.target.value)} className="h-10 max-w-md">
      {sections.map((s) => (
        <option key={s.id} value={s.id}>
          {s.groupCode} · {s.subjectCode} — {s.subjectName} ({s.name})
        </option>
      ))}
    </Select>
  );
}
