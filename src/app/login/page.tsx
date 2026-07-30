import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { dashboardPath } from '@/lib/authz';
import { LoginForm } from './login-form';

export const metadata = { title: 'เข้าสู่ระบบ · Track วิชาเสริม' };

export default async function LoginPage() {
  const user = await getSession();
  if (user) redirect(dashboardPath(user.role));

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Left — aurora brand panel (desktop only) */}
      <section className="relative hidden overflow-hidden bg-[#1d0f33] lg:block">
        <div
          className="pointer-events-none absolute -left-24 top-10 size-[36rem] rounded-full blur-3xl"
          style={{ background: 'rgba(122,63,192,0.45)', animation: 'aurora-drift 22s ease-in-out infinite' }}
        />
        <div
          className="pointer-events-none absolute right-0 top-1/3 size-[32rem] rounded-full blur-3xl"
          style={{ background: 'rgba(59,42,142,0.5)', animation: 'aurora-drift 26s ease-in-out infinite reverse' }}
        />
        <div
          className="pointer-events-none absolute bottom-0 left-1/4 size-[24rem] rounded-full blur-3xl"
          style={{ background: 'rgba(245,197,24,0.14)', animation: 'aurora-drift 18s ease-in-out infinite' }}
        />
        <div className="relative z-10 flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15 text-xl font-bold text-[#F5C518]">
              T
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Track · วิชาเสริม</p>
              <p className="text-xs text-white/60">โรงเรียนสุคนธีรวิทย์</p>
            </div>
          </div>
          <div className="anim-fade-up">
            <h1 className="max-w-md text-4xl font-semibold tracking-tight sm:text-5xl">
              ระบบ<span className="text-[#F5C518]">วิชาเสริม</span> ม.ปลาย
            </h1>
            <p className="mt-4 max-w-sm text-sm text-white/70">
              จัดกลุ่มวิชา จัดนักเรียนเข้าเรียน เช็คชื่อ และประเมินผล — ครบในที่เดียว
              เชื่อมข้อมูลนักเรียนและครูจาก SchoolOS
            </p>
            <div className="mt-6 h-0.5 w-14 rounded-full bg-[#F5C518]" />
          </div>
          <p className="text-xs text-white/40">
            © {new Date().getFullYear()} SchoolOS · Track
          </p>
        </div>
      </section>

      {/* Right — form */}
      <section className="flex items-center justify-center bg-background px-5 py-10">
        <div className="w-full max-w-sm anim-fade-up">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2">
              <span className="grid size-10 place-items-center rounded-xl bg-primary text-lg font-bold text-[#F5C518]">
                T
              </span>
              <div className="leading-tight">
                <p className="text-sm font-semibold">Track · วิชาเสริม</p>
                <p className="text-xs text-muted-foreground">โรงเรียนสุคนธีรวิทย์</p>
              </div>
            </div>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">เข้าสู่ระบบ</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            กรอกชื่อผู้ใช้/รหัสประจำตัวและรหัสผ่าน ระบบจะตรวจสอบสิทธิ์ให้อัตโนมัติ
          </p>
          <div className="mt-6">
            <LoginForm />
          </div>
        </div>
      </section>
    </main>
  );
}
