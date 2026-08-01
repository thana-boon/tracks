import { UserRoundX } from 'lucide-react';
import { alumniOf } from '@/lib/alumni';
import { sortGrades } from '@/lib/utils';
import { Card, CardHeader } from '@/components/ui';
import { AlumniTable } from '@/components/alumni-table';

export const metadata = { title: 'นักเรียนที่ลาออก' };

/**
 * นักเรียนที่ลาออก — ระเบียนย้อนหลังอย่างเดียว
 *
 * Same contract as หน้านักเรียนที่จบการศึกษา: read-only, and reachable after the
 * student has stopped appearing anywhere else in the app.
 */
export default async function WithdrawnPage() {
  const rows = await alumniOf('withdrawn');
  const grades = sortGrades(rows.map((r) => r.gradeLevel));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">นักเรียนที่ลาออก</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ระเบียนย้อนหลังของนักเรียนที่ลาออกระหว่างเรียน — วิชาที่ผ่านไปแล้วยังออกทรานสคริปต์ได้
          โดยรวมของ<strong>ทุกปีการศึกษา</strong> และจะไม่ปรากฏในหน้าจัดนักเรียนเข้าวิชาและหน้าเช็คชื่ออีก
        </p>
      </div>

      <Card>
        <CardHeader
          icon={<UserRoundX className="size-4.5" strokeWidth={1.8} />}
          title="รายชื่อ"
        />
        <AlumniTable
          rows={rows}
          grades={grades}
          emptyTitle="ยังไม่มีนักเรียนที่ลาออก"
          emptyHint="รายชื่อจะขึ้นเองเมื่อ SchoolOS เปลี่ยนสถานะนักเรียนเป็น “ลาออก” แล้วระบบซิงก์รอบถัดไป"
        />
      </Card>
    </div>
  );
}
