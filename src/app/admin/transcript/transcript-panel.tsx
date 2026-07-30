'use client';

import { useState } from 'react';
import { FileText, FileDown } from 'lucide-react';
import { Card, CardHeader, Button, Select, Label } from '@/components/ui';
import { cn } from '@/lib/utils';

type Mode = 'grade' | 'subject' | 'classroom';

export function TranscriptPanel({
  grades,
  roomsByGrade,
  subjects,
  classrooms,
}: {
  grades: string[];
  roomsByGrade: Record<string, string[]>;
  subjects: { id: number; code: string; name: string; groupCode: string }[];
  classrooms: { id: number; name: string }[];
}) {
  const [mode, setMode] = useState<Mode>('grade');
  const [grade, setGrade] = useState(grades[0] ?? '');
  const [room, setRoom] = useState('all');
  const [subject, setSubject] = useState(subjects[0]?.id ?? 0);
  const [classroom, setClassroom] = useState(classrooms[0]?.id ?? 0);

  const rooms = roomsByGrade[grade] ?? [];

  let href = '';
  let disabled = false;
  if (mode === 'grade') {
    href = `/api/transcript?grade=${encodeURIComponent(grade)}${room !== 'all' ? `&room=${encodeURIComponent(room)}` : ''}`;
    disabled = !grade;
  } else if (mode === 'subject') {
    href = `/api/transcript?subject=${subject}`;
    disabled = !subject;
  } else {
    href = `/api/transcript?classroom=${classroom}`;
    disabled = !classroom;
  }

  return (
    <Card className="max-w-xl">
      <CardHeader icon={<FileText className="size-4.5" strokeWidth={1.8} />} title="เลือกกลุ่มนักเรียน" />
      <div className="space-y-4 px-4 pb-5 sm:px-5">
        <div className="flex flex-wrap gap-2">
          <ModeTab active={mode === 'grade'} onClick={() => setMode('grade')}>ตามชั้น/ห้อง</ModeTab>
          <ModeTab active={mode === 'subject'} onClick={() => setMode('subject')} disabled={subjects.length === 0}>ตามวิชา</ModeTab>
          <ModeTab active={mode === 'classroom'} onClick={() => setMode('classroom')} disabled={classrooms.length === 0}>ห้องเรียนพิเศษ</ModeTab>
        </div>

        {mode === 'grade' ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="t-grade">ระดับชั้น</Label>
              <Select id="t-grade" value={grade} onChange={(e) => { setGrade(e.target.value); setRoom('all'); }}>
                {grades.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="t-room">ห้อง</Label>
              <Select id="t-room" value={room} onChange={(e) => setRoom(e.target.value)}>
                <option value="all">ทุกห้อง</option>
                {rooms.map((r) => (
                  <option key={r} value={r}>ห้อง {r}</option>
                ))}
              </Select>
            </div>
          </div>
        ) : mode === 'subject' ? (
          <div>
            <Label htmlFor="t-subject">วิชา</Label>
            <Select id="t-subject" value={subject} onChange={(e) => setSubject(Number(e.target.value))}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.groupCode} · {s.code} — {s.name}</option>
              ))}
            </Select>
          </div>
        ) : (
          <div>
            <Label htmlFor="t-classroom">ห้องเรียนพิเศษ</Label>
            <Select id="t-classroom" value={classroom} onChange={(e) => setClassroom(Number(e.target.value))}>
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
        )}

        {disabled ? (
          <Button className="w-full" disabled>
            <FileDown className="size-4.5" strokeWidth={1.8} /> เลือกเงื่อนไขก่อน
          </Button>
        ) : (
          <a href={href} target="_blank" rel="noopener noreferrer">
            <Button className="w-full">
              <FileDown className="size-4.5" strokeWidth={1.8} /> ออกทรานสคริปต์ (PDF)
            </Button>
          </a>
        )}
        <p className="text-xs text-muted-foreground">
          เอกสารรวมทุกวิชาเสริมของนักเรียนในปีนี้ · 1 หน้าต่อ 1 คน — ผลคำนวณจากการเช็คชื่อ
        </p>
      </div>
    </Card>
  );
}

function ModeTab({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:bg-secondary/60',
      )}
    >
      {children}
    </button>
  );
}
