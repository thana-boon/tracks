import { Printer } from 'lucide-react';
import { requireRole } from '@/lib/authz';
import { activeYear } from '@/lib/years';
import {
  listSections,
  classDatesBySection,
  studentCountsBySection,
} from '@/lib/data';
import { NeedYear, EmptyState } from '@/components/ui';
import { byClassOrder } from '@/lib/utils';
import { PrintPanel, type PrintSection } from './print-panel';

export const metadata = { title: 'พิมพ์ใบเช็คชื่อ' };

export default async function AttendancePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  // Printing blank sheets is an admin job — the attendance layout lets teachers
  // in, so this page guards itself and bounces them to their own dashboard.
  await requireRole('admin');

  const year = await activeYear();
  if (!year) return <NeedYear />;

  const [sections, datesBy, countBy] = await Promise.all([
    listSections(year.id),
    classDatesBySection(year.id),
    studentCountsBySection(year.id),
  ]);

  if (sections.length === 0)
    return (
      <EmptyState
        icon={<Printer className="size-8" strokeWidth={1.5} />}
        title="ยังไม่มีกลุ่มเรียน"
        hint="จัดนักเรียนเข้าวิชาก่อน จึงจะพิมพ์ใบเช็คชื่อได้"
      />
    );

  // ชั้น/กลุ่ม order — the sheets come out of the printer in the order this list
  // is read in, so ม.4 กลุ่ม 1-3 stay together rather than following their วิชา.
  const items: PrintSection[] = sections
    .map((s) => ({
      id: s.id,
      name: s.name,
      subjectCode: s.subjectCode,
      subjectName: s.subjectName,
      groupCode: s.groupCode,
      groupName: s.groupName,
      room: s.room,
      studentCount: countBy.get(s.id) ?? 0,
      classDates: datesBy.get(s.id) ?? [],
    }))
    .sort(byClassOrder);

  // A ?section= link (from ผลเช็คชื่อ) pre-ticks that one; otherwise start empty
  // so nothing is printed by accident.
  const sp = await searchParams;
  const asked = Number(sp.section);
  const current = items.some((s) => s.id === asked) ? [asked] : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">พิมพ์ใบเช็คชื่อ</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ใบเช็คชื่อเปล่า A4 แนวตั้ง หน้าละ 1 กลุ่มเรียน · ปีการศึกษา {year.year} —
          เลือกได้หลายกลุ่มพร้อมกัน แล้วเปิดเป็น PDF สั่งพิมพ์
        </p>
      </div>
      <PrintPanel sections={items} current={current} />
    </div>
  );
}
