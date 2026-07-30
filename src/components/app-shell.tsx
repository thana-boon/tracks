'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X, LogOut, PanelLeftClose, PanelLeft } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { navFor, roleLabel, type NavItem } from './nav-config';
import type { AppRole } from '@/lib/session';

export function AppShell({
  role,
  name,
  yearLabel,
  children,
}: {
  role: AppRole;
  name: string;
  yearLabel?: string;
  children: React.ReactNode;
}) {
  const nav = navFor(role);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Sidebar (desktop) */}
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex',
          collapsed ? 'w-20' : 'w-64',
        )}
      >
        <SidebarContent
          role={role}
          name={name}
          nav={nav}
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
        />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-sidebar text-sidebar-foreground anim-fade-up">
            <SidebarContent
              role={role}
              name={name}
              nav={nav}
              collapsed={false}
              onNavigate={() => setMobileOpen(false)}
              onClose={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/60 px-4 backdrop-blur sm:px-6">
          <button
            className="grid size-10 place-items-center rounded-lg text-foreground hover:bg-secondary/60 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="เปิดเมนู"
          >
            <Menu className="size-5.5" strokeWidth={1.7} />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">{roleLabel[role]}</h1>
            {yearLabel ? (
              <p className="truncate text-xs text-muted-foreground">{yearLabel}</p>
            ) : null}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight">{name}</p>
              <p className="text-xs text-muted-foreground">{roleLabel[role]}</p>
            </div>
            <span className="grid size-9 place-items-center rounded-full bg-primary text-sm font-semibold text-[#F5C518]">
              {name.trim().charAt(0) || 'ผ'}
            </span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({
  role,
  name,
  nav,
  collapsed,
  onToggle,
  onNavigate,
  onClose,
}: {
  role: AppRole;
  name: string;
  nav: NavItem[];
  collapsed: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    toast.success('ออกจากระบบแล้ว');
    router.replace('/login');
    router.refresh();
  }

  // Exact match for dashboards; prefix elsewhere. /attendance/view and /print
  // are their own entries, so /attendance itself needs an exact match too.
  const isActive = (href: string) => {
    if (href === `/${role}` || href === '/attendance') return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <>
      <div className="flex items-center gap-2.5 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-lg font-bold text-[#F5C518] ring-1 ring-white/15">
          T
        </span>
        {!collapsed ? (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold">Track · วิชาเสริม</p>
            <p className="truncate text-xs text-white/50">โรงเรียนสุคนธีรวิทย์</p>
          </div>
        ) : null}
        {onClose ? (
          <button
            className="ml-auto grid size-8 place-items-center rounded-lg text-white/70 hover:bg-white/10 lg:hidden"
            onClick={onClose}
            aria-label="ปิดเมนู"
          >
            <X className="size-5" strokeWidth={1.7} />
          </button>
        ) : null}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {nav.map((item) => {
          const act = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={act ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                collapsed && 'justify-center px-0',
                act
                  ? 'bg-white/15 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white',
              )}
            >
              {item.icon}
              {!collapsed ? <span className="truncate">{item.label}</span> : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/8 p-3">
        {!collapsed ? (
          <div className="mb-2 flex items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-white/8">
            <span className="grid size-8 place-items-center rounded-full bg-[#F5C518] text-xs font-semibold text-[#241b04]">
              {name.trim().charAt(0) || 'ผ'}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-medium text-white">{name}</p>
              <p className="truncate text-xs text-white/50">{roleLabel[role]}</p>
            </div>
          </div>
        ) : null}
        <div className={cn('flex gap-2', collapsed && 'flex-col')}>
          <button
            onClick={logout}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white"
            title="ออกจากระบบ"
          >
            <LogOut className="size-4.5" strokeWidth={1.7} />
            {!collapsed ? 'ออกจากระบบ' : null}
          </button>
          {onToggle ? (
            <button
              onClick={onToggle}
              className="hidden size-9 place-items-center rounded-xl text-white/70 hover:bg-white/10 hover:text-white lg:grid"
              aria-label={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
            >
              {collapsed ? (
                <PanelLeft className="size-4.5" strokeWidth={1.7} />
              ) : (
                <PanelLeftClose className="size-4.5" strokeWidth={1.7} />
              )}
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
