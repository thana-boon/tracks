import { currentUser, dashboardPath } from '@/lib/authz';
import { photoUrlOf } from '@/lib/session';
import { roleLabel } from '@/components/nav-config';
import { ssoConfig } from '@/lib/sso';
import { LoginForm } from './login-form';
import { SignedInNotice } from './signed-in-notice';

export const metadata = { title: 'เข้าสู่ระบบ' };

/**
 * Never prerendered: the SSO settings are read from the server environment at
 * request time (that is the point of them not being build-time constants), and
 * a cached login page would also be a cached "who is signed in" answer.
 */
export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  /**
   * Somebody may already be signed in on this browser — and on a shared machine
   * that somebody is not necessarily the person now looking at the screen.
   *
   * This used to redirect straight into whatever session it found, which made
   * the login page unreachable for the second person at the same computer: they
   * asked to sign in and were shown the first person's dashboard instead, with
   * no form anywhere to correct it. It now says whose session it is and lets
   * them either keep it or throw it away (SignedInNotice).
   */
  const user = await currentUser();

  // Handed down rather than fetched from /api/auth/sso/config: this page is
  // rendered on the server anyway, so the browser can start asking SchoolOS for
  // a code immediately instead of spending a round trip finding out where to
  // ask. The endpoint still exists — it is the published contract, and the way
  // to check a deployment's settings from outside — and both read the same env.
  const sso = ssoConfig();

  // Only a path inside this app is a legal destination — "//evil.example" also
  // starts with "/" and would send them off-site (same rule as the form's).
  const raw = (await searchParams).next;
  const next = typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : null;

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
            {user
              ? 'มีบัญชีที่เข้าสู่ระบบค้างอยู่บนเบราว์เซอร์นี้'
              : 'กรอกชื่อผู้ใช้/รหัสประจำตัวและรหัสผ่าน ระบบจะตรวจสอบสิทธิ์ให้อัตโนมัติ'}
          </p>
          <div className="mt-6">
            {user ? (
              <SignedInNotice
                name={user.name}
                firstName={user.firstName}
                roleLabel={roleLabel[user.role]}
                photoUrl={photoUrlOf(user)}
                continueTo={next ?? dashboardPath(user.role)}
                sso={sso}
              />
            ) : (
              <LoginForm sso={sso} />
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
