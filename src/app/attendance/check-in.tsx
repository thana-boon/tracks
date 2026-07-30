'use client';

import { useEffect, useState, useTransition } from 'react';
import { ClipboardCheck, Sun, Moon, Save, Loader2, CheckCircle2, XCircle, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardHeader, Button, Select, Input, Badge, EmptyState } from '@/components/ui';
import { THAI_WEEKDAYS, weekdayOfYmd, cn } from '@/lib/utils';
import { loadRoster, saveAttendance, type RosterEntry } from './actions';

export interface CheckInSubject {
  id: number;
  code: string;
  name: string;
  groupCode: string;
  meetingDays: number[];
}

export function CheckIn({
  subjects,
  today,
}: {
  subjects: CheckInSubject[];
  today: string;
}) {
  const [subjectId, setSubjectId] = useState<number | null>(subjects[0]?.id ?? null);
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState<'morning' | 'afternoon'>('morning');
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [present, setPresent] = useState<Map<number, boolean>>(new Map());
  const [loading, startLoad] = useTransition();
  const [saving, setSaving] = useState(false);

  const subject = subjects.find((s) => s.id === subjectId) ?? null;
  const weekday = weekdayOfYmd(date);
  const meetsToday = subject ? subject.meetingDays.length === 0 || subject.meetingDays.includes(weekday) : true;

  function refresh() {
    if (!subjectId) return;
    startLoad(async () => {
      const r = await loadRoster(subjectId, date, slot);
      if (!r.ok) {
        toast.error(r.message ?? 'โหลดรายชื่อไม่สำเร็จ');
        setRoster([]);
        return;
      }
      setRoster(r.roster);
      // default: present, unless a record already says otherwise
      setPresent(new Map(r.roster.map((e) => [e.studentId, e.present ?? true])));
    });
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, date, slot]);

  function setAll(value: boolean) {
    if (!roster) return;
    setPresent(new Map(roster.map((e) => [e.studentId, value])));
  }

  async function submit() {
    if (!subjectId || !roster || saving) return;
    setSaving(true);
    const records = roster.map((e) => ({ studentId: e.studentId, present: present.get(e.studentId) ?? true }));
    const r = await saveAttendance({ subjectId, date, slot, records });
    setSaving(false);
    if (r.ok) {
      toast.success(r.message);
      refresh();
    } else {
      toast.error(r.message);
    }
  }

  const presentCount = roster ? roster.filter((e) => present.get(e.studentId)).length : 0;

  if (subjects.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardCheck className="size-8" strokeWidth={1.5} />}
        title="ยังไม่มีวิชาให้เช็คชื่อ"
        hint="ต้องมีวิชาเสริมที่จัดนักเรียนเข้าเรียนแล้วจึงจะเช็คชื่อได้"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">เช็คชื่อ</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          บันทึกการเข้าเรียนรายวัน แยกช่วงเช้า/บ่าย — ค่าเริ่มต้นคือ “มา” ปรับเฉพาะคนที่ขาด
        </p>
      </div>

      <Card>
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">วิชา</label>
            <Select value={subjectId ?? ''} onChange={(e) => setSubjectId(Number(e.target.value))}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.groupCode} · {s.code} — {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">วันที่</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">ช่วง</label>
            <div className="flex gap-2">
              <SlotButton active={slot === 'morning'} onClick={() => setSlot('morning')} icon={<Sun className="size-4" strokeWidth={1.8} />}>
                เช้า
              </SlotButton>
              <SlotButton active={slot === 'afternoon'} onClick={() => setSlot('afternoon')} icon={<Moon className="size-4" strokeWidth={1.8} />}>
                บ่าย
              </SlotButton>
            </div>
          </div>
          <div className="flex items-end">
            <div className="text-sm text-muted-foreground">
              {THAI_WEEKDAYS[weekday] ? `วัน${THAI_WEEKDAYS[weekday]}` : ''}
              {subject && !meetsToday ? (
                <Badge tone="accent" className="ml-2">ไม่ใช่วันเรียนปกติ</Badge>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          icon={<Users className="size-4.5" strokeWidth={1.8} />}
          title="รายชื่อนักเรียน"
          action={
            roster && roster.length > 0 ? (
              <div className="flex items-center gap-2">
                <Badge tone="success">มา {presentCount}</Badge>
                <Badge tone="destructive">ขาด {roster.length - presentCount}</Badge>
              </div>
            ) : null
          }
        />
        <div className="px-4 pb-4 sm:px-5">
          {loading ? (
            <div className="grid place-items-center py-16 text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : !roster || roster.length === 0 ? (
            <EmptyState title="ไม่มีนักเรียนในวิชานี้" hint="จัดนักเรียนเข้าวิชาก่อนที่หน้า “จัดนักเรียนเข้าวิชา”" />
          ) : (
            <>
              <div className="mb-3 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setAll(true)}>ทั้งหมดมา</Button>
                <Button size="sm" variant="ghost" onClick={() => setAll(false)}>ทั้งหมดขาด</Button>
              </div>
              <ul className="divide-y divide-border/60">
                {roster.map((e) => {
                  const on = present.get(e.studentId) ?? true;
                  return (
                    <li key={e.studentId} className="flex items-center gap-3 py-2.5">
                      <span className="w-16 shrink-0 text-xs text-muted-foreground tabular-nums">{e.code}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {e.fullName}
                        {e.nickname ? <span className="text-muted-foreground"> ({e.nickname})</span> : null}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{e.gradeLevel}/{e.classroom}</span>
                      <div className="flex shrink-0 gap-1">
                        <PresenceButton active={on} tone="present" onClick={() => setPresent((p) => new Map(p).set(e.studentId, true))} />
                        <PresenceButton active={!on} tone="absent" onClick={() => setPresent((p) => new Map(p).set(e.studentId, false))} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <Button className="mt-4 w-full" onClick={submit} disabled={saving}>
                {saving ? <Loader2 className="size-4.5 animate-spin" /> : <Save className="size-4.5" strokeWidth={1.8} />}
                บันทึกเช็คชื่อ ({presentCount}/{roster.length})
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

function SlotButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:bg-secondary/60',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function PresenceButton({ active, tone, onClick }: { active: boolean; tone: 'present' | 'absent'; onClick: () => void }) {
  const Icon = tone === 'present' ? CheckCircle2 : XCircle;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={tone === 'present' ? 'มา' : 'ขาด'}
      className={cn(
        'grid size-9 place-items-center rounded-lg border transition-colors',
        active
          ? tone === 'present'
            ? 'border-success bg-success/10 text-success'
            : 'border-destructive bg-destructive/10 text-destructive'
          : 'border-border text-muted-foreground hover:bg-secondary/60',
      )}
    >
      <Icon className="size-5" strokeWidth={1.9} />
    </button>
  );
}
