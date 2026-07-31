import { desc } from 'drizzle-orm';
import { ScrollText } from 'lucide-react';
import { db } from '@/db';
import { activityLogs } from '@/db/schema';
import { Card, CardHeader, Badge, EmptyState } from '@/components/ui';
import { thaiDateTimeLongOf } from '@/lib/utils';

export const metadata = { title: 'ประวัติการใช้งาน' };

const ACTION_LABEL: Record<string, string> = {
  login: 'เข้าสู่ระบบ',
  sync_years: 'ซิงก์ปีการศึกษา',
  sync_students: 'ซิงก์นักเรียน',
  sync_teachers: 'ซิงก์ครู',
  sync_homerooms: 'ซิงก์ครูที่ปรึกษา',
  create_group: 'เพิ่มกลุ่มวิชา',
  update_group: 'แก้ไขกลุ่มวิชา',
  delete_group: 'ลบกลุ่มวิชา',
  enable_group: 'เปิดใช้งานกลุ่ม',
  disable_group: 'ปิดใช้งานกลุ่ม',
  create_subject: 'เพิ่มวิชา',
  update_subject: 'แก้ไขวิชา',
  delete_subject: 'ลบวิชา',
  enable_subject: 'เปิดใช้งานวิชา',
  disable_subject: 'ปิดใช้งานวิชา',
  create_classroom: 'เพิ่มห้องเรียนพิเศษ',
  update_classroom: 'แก้ไขห้องเรียนพิเศษ',
  delete_classroom: 'ลบห้องเรียนพิเศษ',
  set_classroom_members: 'ตั้งสมาชิกห้อง',
  set_meeting_days: 'ตั้งวันเรียน',
  set_assignments: 'จัดนักเรียนเข้าวิชา',
  save_attendance: 'บันทึกเช็คชื่อ',
  create_backup: 'สำรองข้อมูล',
  delete_backup: 'ลบไฟล์สำรอง',
  restore_backup: 'กู้คืนข้อมูล',
  restore_upload: 'กู้คืนจากไฟล์อัปโหลด',
};

const DESTRUCTIVE = new Set(['delete_group', 'delete_subject', 'delete_classroom', 'delete_backup', 'restore_backup', 'restore_upload']);

export default async function LogsPage() {
  const rows = await db
    .select()
    .from(activityLogs)
    .orderBy(desc(activityLogs.createdAt))
    .limit(300);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ประวัติการใช้งาน</h1>
        <p className="mt-1 text-sm text-muted-foreground">บันทึกการกระทำสำคัญของผู้ดูแลและครู · แสดง 300 รายการล่าสุด</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<ScrollText className="size-8" strokeWidth={1.5} />} title="ยังไม่มีบันทึกการใช้งาน" hint="กิจกรรมจะปรากฏที่นี่เมื่อมีการใช้งานระบบ" />
      ) : (
        <Card>
          <CardHeader icon={<ScrollText className="size-4.5" strokeWidth={1.8} />} title="รายการล่าสุด" />
          <ul className="divide-y divide-border/60">
            {rows.map((r) => {
              const detail = r.detail as Record<string, unknown> | null;
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 sm:px-5">
                  <Badge tone={DESTRUCTIVE.has(r.action) ? 'destructive' : 'primary'} className="shrink-0">
                    {ACTION_LABEL[r.action] ?? r.action}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-medium">{r.actorName}</span>
                    {r.target ? <span className="text-muted-foreground"> · {r.target}</span> : null}
                    {detail ? (
                      <span className="text-xs text-muted-foreground"> · {formatDetail(detail)}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {thaiDateTimeLongOf(r.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

function formatDetail(detail: Record<string, unknown>): string {
  return Object.entries(detail)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(',') : String(v)}`)
    .join(' · ');
}
