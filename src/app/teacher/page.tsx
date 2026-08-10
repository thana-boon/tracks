import Link from 'next/link';
import { ClipboardCheck, Users, ArrowUpRight, CalendarCheck } from 'lucide-react';
import { requireRole } from '@/lib/authz';
import { activeYear } from '@/lib/years';
import { db } from '@/db';
import { homerooms } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { Card } from '@/components/ui';

export const metadata = { title: 'ภาพรวมครู' };

const tiles = [
  { href: '/attendance', title: 'เช็คชื่อ', desc: 'บันทึกการเข้าเรียน เช้า/บ่าย', icon: ClipboardCheck, tone: 'primary' },
  { href: '/results', title: 'เวลาเข้าเรียน', desc: 'ห้องที่ปรึกษาของคุณ — มากี่ครั้ง ขาดกี่ครั้ง', icon: CalendarCheck, tone: 'accent' },
] as const;

const iconTone: Record<string, string> = {
  primary: 'bg-primary/10 text-primary',
  navy: 'bg-navy/10 text-navy',
  accent: 'bg-[#F5C518]/15 text-[#8a6a00]',
};

export default async function TeacherHome() {
  const user = await requireRole('teacher');
  const year = await activeYear();

  let homeroomCount = 0;
  if (year && user.personId) {
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(homerooms)
      .where(and(eq(homerooms.yearId, year.id), eq(homerooms.teacherId, user.personId)));
    homeroomCount = Number(row?.n ?? 0);
  }

  return (
    <div className="space-y-6">
      <section className="anim-fade-up overflow-hidden rounded-2xl bg-[#2a1547] p-6 text-white lg:p-7">
        <p className="text-xs font-medium uppercase tracking-wide text-white/60">ระบบวิชาเสริม ม.ปลาย</p>
        <h1 className="mt-1 text-2xl font-semibold">สวัสดี {user.name}</h1>
        <p className="mt-1 text-sm text-white/70">
          {year ? `ปีการศึกษา ${year.year}` : 'ยังไม่ได้ซิงก์ปีการศึกษา'} · ครูทุกคนเช็คชื่อวิชาเสริมได้ทุกวิชา
        </p>
        <div className="mt-4 h-0.5 w-10 rounded-full bg-[#F5C518]" />
      </section>

      <section className="grid gap-3 stagger-children sm:grid-cols-2">
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
              <ArrowUpRight className="size-5 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary group-hover:opacity-100" strokeWidth={1.8} />
            </Link>
          );
        })}
        {homeroomCount > 0 ? (
          <Link
            href="/homeroom"
            style={{ ['--i' as string]: tiles.length }}
            className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md"
          >
            <span className="grid size-13 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Users className="size-6" strokeWidth={1.7} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold tracking-tight">ห้องที่ปรึกษา</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">ดูผลวิชาเสริมของนักเรียนในห้องที่ปรึกษา {homeroomCount} ห้อง</p>
            </div>
            <ArrowUpRight className="size-5 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary group-hover:opacity-100" strokeWidth={1.8} />
          </Link>
        ) : null}
      </section>
    </div>
  );
}
