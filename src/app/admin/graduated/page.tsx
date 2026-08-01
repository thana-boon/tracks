import { GraduationCap } from 'lucide-react';
import { alumniOf } from '@/lib/alumni';
import { sortGrades } from '@/lib/utils';
import { Card, CardHeader } from '@/components/ui';
import { AlumniTable } from '@/components/alumni-table';

export const metadata = { title: 'นักเรียนที่จบการศึกษา' };

/**
 * นักเรียนที่จบการศึกษา — ระเบียนย้อนหลังอย่างเดียว
 *
 * Nothing here writes. Assignment and check-in read `status = 'studying'`, so
 * these students are already absent from those screens; this page exists so the
 * record they left behind stays reachable after they are gone.
 */
export default async function GraduatedPage() {
  const rows = await alumniOf('graduated');
  const grades = sortGrades(rows.map((r) => r.gradeLevel));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">นักเรียนที่จบการศึกษา</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ระเบียนย้อนหลังของนักเรียนที่จบไปแล้ว — ออกทรานสคริปต์ย้อนหลังได้ตามปกติ
          โดยรวมวิชาที่ผ่านของ<strong>ทุกปีการศึกษา</strong> แต่จะไม่ปรากฏในหน้าจัดนักเรียนเข้าวิชาและหน้าเช็คชื่ออีก
        </p>
      </div>

      <Card>
        <CardHeader
          icon={<GraduationCap className="size-4.5" strokeWidth={1.8} />}
          title="รายชื่อ"
        />
        <AlumniTable
          rows={rows}
          grades={grades}
          emptyTitle="ยังไม่มีนักเรียนที่จบการศึกษา"
          emptyHint="รายชื่อจะขึ้นเองเมื่อ SchoolOS เปลี่ยนสถานะนักเรียนเป็น “จบการศึกษา” แล้วระบบซิงก์รอบถัดไป"
        />
      </Card>
    </div>
  );
}
