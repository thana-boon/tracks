'use client';

import { BookOpen, User } from 'lucide-react';
import { phaseShort } from '@/lib/subject-phase';
import type { TrackSubjectRow } from '@/lib/track-core';

/**
 * วิชาที่จะได้เรียนถ้าเลือกสายนี้ — the same list on both screens.
 *
 * Shared rather than written twice because it is one promise being shown to
 * two people: the ผู้ดูแล previews it while building the สาย, the นักเรียน reads
 * it before choosing, and the two disagreeing about what a สาย contains is the
 * one thing this list must never do.
 */
export function SubjectList({
  subjects,
  empty = 'ยังไม่มีวิชาในกลุ่มนี้สำหรับช่วงที่เลือก',
}: {
  subjects: TrackSubjectRow[];
  empty?: string;
}) {
  if (!subjects.length) return <p className="text-xs text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {subjects.map((s) => {
        const slot = phaseShort(s.semester, s.phase);
        return (
          <li key={s.id} className="flex items-start gap-2.5 rounded-lg bg-secondary/40 px-3 py-2">
            <BookOpen
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              strokeWidth={1.8}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                <span className="text-muted-foreground">{s.code}</span> {s.name}
              </p>
              {s.description ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>
              ) : null}
              {s.teacherName ? (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <User className="size-3.5" strokeWidth={1.8} />
                  {s.teacherName}
                </p>
              ) : null}
            </div>
            {slot ? (
              <span className="shrink-0 rounded-full bg-card px-2 py-0.5 text-[11px] text-muted-foreground">
                {slot}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
