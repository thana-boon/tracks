'use client';

import { useMemo, useState } from 'react';
import { Eye, FileText, Printer, RefreshCw, Users, X } from 'lucide-react';
import { Card, CardHeader, Button, Select, Label } from '@/components/ui';
import { StudentPicker, type PickStudent } from '@/components/student-picker';
import { cn } from '@/lib/utils';

type Mode = 'room' | 'picked';

/**
 * Choosing who to print, and looking at the result without printing it.
 *
 * Two ways in, because they are two different jobs: ตามชั้น/ห้อง is the batch a
 * ครูที่ปรึกษา hands out at the end of the year, and รายบุคคล is the reprint a
 * student asks for at the counter. Anything wider than that (all of a วิชา, a
 * ห้องเรียนพิเศษ) turned out not to match how these are actually issued.
 *
 * The preview is deliberate rather than automatic: rendering a whole ชั้น is
 * hundreds of pages, so it happens when asked for and the button says so.
 */
export function TranscriptPanel({
  grades,
  roomsByGrade,
  students,
}: {
  grades: string[];
  roomsByGrade: Record<string, string[]>;
  students: PickStudent[];
}) {
  const [mode, setMode] = useState<Mode>('room');
  const [grade, setGrade] = useState(grades[0] ?? '');
  const [room, setRoom] = useState('all');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState('');

  const rooms = roomsByGrade[grade] ?? [];

  const inRoom = useMemo(
    () =>
      students.filter(
        (s) => s.gradeLevel === grade && (room === 'all' || s.classroom === room),
      ).length,
    [students, grade, room],
  );

  const href =
    mode === 'room'
      ? `/api/transcript?grade=${encodeURIComponent(grade)}${
          room !== 'all' ? `&room=${encodeURIComponent(room)}` : ''
        }`
      : `/api/transcript?students=${[...picked].join(',')}`;

  const count = mode === 'room' ? inRoom : picked.size;
  const disabled = mode === 'room' ? !grade || inRoom === 0 : picked.size === 0;
  const stale = preview !== '' && preview !== href;

  function toggle(id: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function bulk(ids: number[], select: boolean) {
    setPicked((prev) => {
      const next = new Set(prev);
      for (const id of ids) select ? next.add(id) : next.delete(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          icon={<FileText className="size-4.5" strokeWidth={1.8} />}
          title="เลือกนักเรียน"
          action={
            count > 0 ? (
              <span className="text-xs text-muted-foreground">
                {count.toLocaleString('th-TH')} คน · {count.toLocaleString('th-TH')} หน้า
              </span>
            ) : null
          }
        />
        <div className="space-y-4 px-4 pb-5 sm:px-5">
          <div className="flex flex-wrap gap-2">
            <ModeTab active={mode === 'room'} onClick={() => setMode('room')}>
              ตามชั้น / ห้อง
            </ModeTab>
            <ModeTab active={mode === 'picked'} onClick={() => setMode('picked')}>
              เลือกรายบุคคล
            </ModeTab>
          </div>

          {mode === 'room' ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="t-grade">ระดับชั้น</Label>
                <Select
                  id="t-grade"
                  value={grade}
                  onChange={(e) => {
                    setGrade(e.target.value);
                    setRoom('all');
                  }}
                >
                  {grades.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="t-room">ห้อง</Label>
                <Select id="t-room" value={room} onChange={(e) => setRoom(e.target.value)}>
                  <option value="all">ทุกห้อง</option>
                  {rooms.map((r) => (
                    <option key={r} value={r}>
                      ห้อง {r}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <StudentPicker
                students={students}
                selected={picked}
                onToggle={toggle}
                onBulk={bulk}
                height="h-80"
              />
              {picked.size > 0 ? (
                <button
                  type="button"
                  onClick={() => setPicked(new Set())}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                >
                  ล้างที่เลือกทั้งหมด
                </button>
              ) : null}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={disabled} onClick={() => setPreview(href)}>
              <Eye className="size-4.5" strokeWidth={1.8} />
              {stale ? 'ดูตัวอย่างใหม่' : 'ดูตัวอย่าง'}
            </Button>
            {disabled ? (
              <Button disabled>
                <Printer className="size-4.5" strokeWidth={1.8} />
                เลือกนักเรียนก่อน
              </Button>
            ) : (
              <a href={href} target="_blank" rel="noopener noreferrer">
                <Button>
                  <Printer className="size-4.5" strokeWidth={1.8} /> เปิดเพื่อพิมพ์ / บันทึก
                </Button>
              </a>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            “ดูตัวอย่าง” เปิดเอกสารในหน้านี้เลย ไม่ต้องสั่งพิมพ์ · วิชาที่ไม่ผ่านหรือยังไม่ได้ประเมินจะไม่ถูกพิมพ์ ·{' '}
            <a href="/admin/settings" className="text-primary hover:underline">
              ตั้งค่าตราโรงเรียนและลายเซ็น
            </a>
          </p>
        </div>
      </Card>

      {preview ? (
        <Card className="overflow-hidden">
          <CardHeader
            icon={<Eye className="size-4.5" strokeWidth={1.8} />}
            title="ตัวอย่างเอกสาร"
            action={
              <div className="flex items-center gap-1">
                {stale ? (
                  <button
                    type="button"
                    onClick={() => setPreview(href)}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-secondary/60"
                  >
                    <RefreshCw className="size-3.5" strokeWidth={1.8} />
                    การเลือกเปลี่ยนแล้ว — โหลดใหม่
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setPreview('')}
                  title="ปิดตัวอย่าง"
                  className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                >
                  <X className="size-4.5" strokeWidth={1.8} />
                </button>
              </div>
            }
          />
          <iframe
            key={preview}
            src={preview}
            title="ตัวอย่างทรานสคริปต์"
            className="h-[78vh] min-h-125 w-full border-t border-border bg-secondary/30"
          />
        </Card>
      ) : null}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-muted-foreground hover:bg-secondary/60',
      )}
    >
      <Users className="size-4" strokeWidth={1.8} />
      {children}
    </button>
  );
}
