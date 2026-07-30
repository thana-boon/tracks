'use client';

import { useState } from 'react';
import { Printer, FileDown } from 'lucide-react';
import { Card, CardHeader, Button, Select, Label } from '@/components/ui';

export interface PrintSubject {
  id: number;
  code: string;
  name: string;
  groupCode: string;
}

export function PrintPanel({
  subjects,
  current,
}: {
  subjects: PrintSubject[];
  current: number;
}) {
  const [subjectId, setSubjectId] = useState(current);
  const [columns, setColumns] = useState(16);

  const href = `/api/attendance-sheet?subject=${subjectId}&columns=${columns}`;

  return (
    <Card className="max-w-lg">
      <CardHeader icon={<Printer className="size-4.5" strokeWidth={1.8} />} title="ตัวเลือกการพิมพ์" />
      <div className="space-y-4 px-4 pb-5 sm:px-5">
        <div>
          <Label htmlFor="p-subject">วิชา</Label>
          <Select id="p-subject" value={subjectId} onChange={(e) => setSubjectId(Number(e.target.value))}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.groupCode} · {s.code} — {s.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="p-cols">จำนวนช่องสำหรับกา (ครั้ง)</Label>
          <Select id="p-cols" value={columns} onChange={(e) => setColumns(Number(e.target.value))}>
            {[8, 12, 16, 20, 24, 30].map((n) => (
              <option key={n} value={n}>{n} ช่อง</option>
            ))}
          </Select>
        </div>
        <a href={href} target="_blank" rel="noopener noreferrer">
          <Button className="w-full">
            <FileDown className="size-4.5" strokeWidth={1.8} />
            เปิดใบเช็คชื่อ (PDF)
          </Button>
        </a>
      </div>
    </Card>
  );
}
