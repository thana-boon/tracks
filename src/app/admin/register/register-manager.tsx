'use client';

import { useMemo, useState } from 'react';
import { ClipboardPen, CalendarClock, Save, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardHeader, Button, Select, Badge, EmptyState } from '@/components/ui';
import { StudentPicker, type PickStudent } from '@/components/student-picker';
import { THAI_WEEKDAYS_SHORT } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { saveMeetingDays, setAssignments } from './actions';

export interface RegisterSubject {
  id: number;
  code: string;
  name: string;
  groupCode: string;
  groupName: string;
  teacherName: string | null;
  meetingDays: number[];
  memberIds: number[];
}

export function RegisterManager({
  yearLabel,
  subjects,
  students,
}: {
  yearLabel: string;
  subjects: RegisterSubject[];
  students: PickStudent[];
}) {
  const [subjectId, setSubjectId] = useState<number | null>(subjects[0]?.id ?? null);
  const subject = useMemo(
    () => subjects.find((s) => s.id === subjectId) ?? null,
    [subjects, subjectId],
  );

  if (subjects.length === 0) {
    return (
      <div className="space-y-6">
        <Header yearLabel={yearLabel} />
        <EmptyState
          icon={<ClipboardPen className="size-8" strokeWidth={1.5} />}
          title="ยังไม่มีวิชาเสริมที่เปิดใช้งาน"
          hint="เพิ่มวิชาในหน้า “วิชาเสริม” ก่อน จึงจะจัดนักเรียนเข้าเรียนได้"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header yearLabel={yearLabel} />

      <Card>
        <div className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
          <label className="text-sm font-medium">เลือกวิชา</label>
          <Select
            value={subjectId ?? ''}
            onChange={(e) => setSubjectId(Number(e.target.value))}
            className="h-10 max-w-md flex-1"
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.groupCode} · {s.code} — {s.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {subject ? <SubjectEditor key={subject.id} subject={subject} students={students} /> : null}
    </div>
  );
}

function Header({ yearLabel }: { yearLabel: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">จัดนักเรียนเข้าวิชา</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        กำหนดวันเรียนของวิชา แล้วเลือกนักเรียนเข้าเรียน · {yearLabel} —
        การนำออกจะเก็บเป็นประวัติ ไม่ลบทิ้ง
      </p>
    </div>
  );
}

function SubjectEditor({
  subject,
  students,
}: {
  subject: RegisterSubject;
  students: PickStudent[];
}) {
  const [days, setDays] = useState<Set<number>>(new Set(subject.meetingDays));
  const [selected, setSelected] = useState<Set<number>>(new Set(subject.memberIds));
  const [savingDays, setSavingDays] = useState(false);
  const [savingMembers, setSavingMembers] = useState(false);

  function toggleDay(d: number) {
    setDays((prev) => {
      const next = new Set(prev);
      next.has(d) ? next.delete(d) : next.add(d);
      return next;
    });
  }
  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function bulk(ids: number[], select: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) select ? next.add(id) : next.delete(id);
      return next;
    });
  }

  async function submitDays() {
    if (savingDays) return;
    setSavingDays(true);
    const r = await saveMeetingDays(subject.id, [...days]);
    setSavingDays(false);
    r.ok ? toast.success(r.message) : toast.error(r.message);
  }
  async function submitMembers() {
    if (savingMembers) return;
    setSavingMembers(true);
    const r = await setAssignments(subject.id, [...selected]);
    setSavingMembers(false);
    r.ok ? toast.success(r.message) : toast.error(r.message);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <Card className="h-fit">
        <CardHeader icon={<CalendarClock className="size-4.5" strokeWidth={1.8} />} title="วันเรียน" />
        <div className="px-4 pb-4 sm:px-5">
          <p className="mb-3 text-xs text-muted-foreground">
            เลือกวันในสัปดาห์ที่วิชานี้เรียน — ใช้กรองวันเช็คชื่อและคำนวณผล
          </p>
          <div className="flex flex-wrap gap-1.5">
            {THAI_WEEKDAYS_SHORT.map((label, d) => {
              const on = days.has(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={cn(
                    'grid size-10 place-items-center rounded-lg border text-sm font-medium transition-colors',
                    on
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-secondary/60',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <Button size="sm" className="mt-4 w-full" onClick={submitDays} disabled={savingDays}>
            <Save className="size-4" strokeWidth={1.8} />
            บันทึกวันเรียน
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader
          icon={<Users className="size-4.5" strokeWidth={1.8} />}
          title={`${subject.code} — ${subject.name}`}
          action={<Badge tone="navy">{selected.size} คน</Badge>}
        />
        <div className="px-4 pb-4 sm:px-5">
          <StudentPicker students={students} selected={selected} onToggle={toggle} onBulk={bulk} height="h-[28rem]" />
          <Button className="mt-4 w-full" onClick={submitMembers} disabled={savingMembers}>
            <Save className="size-4.5" strokeWidth={1.8} />
            บันทึกนักเรียนเข้าวิชา ({selected.size})
          </Button>
        </div>
      </Card>
    </div>
  );
}
