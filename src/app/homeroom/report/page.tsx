import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { requireRole } from '@/lib/authz';
import { activeYear } from '@/lib/years';
import { listHomerooms } from '@/lib/homeroom';
import { classDaysOfYear } from '@/lib/subjects-for-user';
import { NeedYear, EmptyState } from '@/components/ui';
import { ExportPanel } from './export-panel';

export const metadata = { title: 'ออกรายงาน PDF' };

/**
 * The PDF export, on its own page. Admin only — a ครูประจำชั้น reads their room
 * on screen; the batch export is a school-wide job.
 *
 * `?room=` pre-ticks the room the admin came from, which is the common case:
 * look at a ห้อง, press PDF, print that ห้อง.
 */
export default async function HomeroomReportPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  await requireRole('admin');
  const year = await activeYear();
  if (!year) return <NeedYear />;

  const [rooms, classDays] = await Promise.all([listHomerooms(year), classDaysOfYear(year)]);
  const months = [...new Set(classDays.map((d) => d.date.slice(0, 7)))];

  const sp = await searchParams;
  const asked = sp.room?.trim();
  const initial = rooms.find((r) => r.key === asked)?.key ?? null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/homeroom"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" strokeWidth={1.8} />
          กลับไปห้องที่ปรึกษา
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">ออกรายงาน PDF</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          รายงานเวลาเข้าเรียนวิชาเสริมรายห้อง · ปีการศึกษา {year.year} — เลือกห้องได้หลายห้องในไฟล์เดียว
        </p>
      </div>

      {rooms.length === 0 ? (
        <EmptyState
          icon={<Users className="size-8" strokeWidth={1.5} />}
          title="ยังไม่มีห้องที่ปรึกษาในปีนี้"
          hint="ห้องมาจากการซิงก์ครูที่ปรึกษา — ระบบซิงก์ให้อัตโนมัติ ดูสถานะได้ที่หน้าซิงก์รายชื่อ"
        />
      ) : (
        <ExportPanel
          rooms={rooms.map((r) => ({
            key: r.key,
            gradeLevel: r.gradeLevel,
            teacherNames: r.teacherNames,
            studentCount: r.studentCount,
          }))}
          months={months}
          initial={initial}
        />
      )}
    </div>
  );
}
