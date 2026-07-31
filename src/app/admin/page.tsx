import Link from 'next/link';
import {
  FolderKanban,
  BookOpen,
  GraduationCap,
  ArrowUpRight,
  RefreshCw,
  ClipboardPen,
  ClipboardCheck,
  School,
} from 'lucide-react';
import { activeYear } from '@/lib/years';
import { adminCounts } from '@/lib/data';
import { Card } from '@/components/ui';

export const metadata = { title: 'ภาพรวม' };

const tiles = [
  { href: '/admin/people', title: 'ซิงก์รายชื่อ', desc: 'ดึงนักเรียน ม.4-6 · ครู · ครูที่ปรึกษา', icon: RefreshCw, tone: 'primary' },
  { href: '/admin/groups', title: 'กลุ่มวิชา', desc: 'จัดกลุ่ม/หมวดหมู่วิชาเสริม', icon: FolderKanban, tone: 'navy' },
  { href: '/admin/subjects', title: 'วิชาเสริม', desc: 'วิชาในแต่ละกลุ่มและครูผู้สอน', icon: BookOpen, tone: 'primary' },
  { href: '/admin/classrooms', title: 'ห้องเรียนพิเศษ', desc: 'จัดกลุ่มห้องแยกจากห้องประจำ', icon: School, tone: 'navy' },
  { href: '/admin/register', title: 'จัดนักเรียนเข้าวิชา', desc: 'กำหนดวันเรียน + เลือกนักเรียน', icon: ClipboardPen, tone: 'accent' },
  { href: '/attendance', title: 'เช็คชื่อ', desc: 'บันทึกการเข้าเรียน เช้า/บ่าย', icon: ClipboardCheck, tone: 'primary' },
  { href: '/results', title: 'ผลการเรียน', desc: 'ผ่าน/ไม่ผ่าน จากการเช็คชื่อ', icon: GraduationCap, tone: 'accent' },
] as const;

const iconTone: Record<string, string> = {
  primary: 'bg-primary/10 text-primary',
  navy: 'bg-navy/10 text-navy',
  accent: 'bg-[#F5C518]/15 text-[#8a6a00]',
};

export default async function AdminHome() {
  const [year, counts] = await Promise.all([activeYear(), adminCounts()]);

  const metrics = [
    { label: 'กลุ่มวิชา', value: counts.groups },
    { label: 'วิชาเสริม', value: counts.subjects },
    { label: 'นักเรียน ม.4-6', value: counts.students },
  ];

  return (
    <div className="space-y-6">
      {/* Status band */}
      <section className="anim-fade-up overflow-hidden rounded-2xl bg-[#2a1547] p-6 text-white lg:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-white/60">ระบบวิชาเสริม ม.ปลาย</p>
            <h1 className="mt-1 text-2xl font-semibold">ภาพรวมผู้ดูแลระบบ</h1>
            <p className="mt-1 text-sm text-white/70">
              {year ? `ปีการศึกษา ${year.year} · กำลังใช้งาน` : 'ยังไม่ได้ซิงก์ปีการศึกษา — เริ่มที่หน้าปีการศึกษา'}
            </p>
            <div className="mt-4 h-0.5 w-10 rounded-full bg-[#F5C518]" />
          </div>
          <div className="flex divide-x divide-white/12">
            {metrics.map((m) => (
              <div key={m.label} className="px-5 first:pl-0">
                <p className="text-xs text-white/60">{m.label}</p>
                <p className="mt-0.5 text-xl font-semibold tabular-nums">{m.value.toLocaleString('th-TH')}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Launcher tiles */}
      <section className="grid gap-3 stagger-children sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t, i) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              style={{ ['--i' as string]: i }}
              className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md"
            >
              <span className={`grid size-13 shrink-0 place-items-center rounded-xl ${iconTone[t.tone]}`}>
                <Icon className="size-6" strokeWidth={1.7} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold tracking-tight">{t.title}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{t.desc}</p>
              </div>
              <ArrowUpRight
                className="size-5 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary group-hover:opacity-100"
                strokeWidth={1.8}
              />
            </Link>
          );
        })}
      </section>
    </div>
  );
}
