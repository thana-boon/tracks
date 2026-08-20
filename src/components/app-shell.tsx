'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, LogOut, PanelLeftClose, PanelLeft, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SsoConfig } from '@/lib/sso-client';
import { AccountMenu } from './account-menu';
import { Avatar } from './avatar';
import { useLogout } from './use-logout';
import { SessionKeeper } from './session-keeper';
import { SessionGuard } from './session-guard';
import {
  navFor,
  roleLabel,
  isGroup,
  itemsOf,
  type NavEntry,
  type NavGroup,
  type NavItem,
} from './nav-config';
import type { AppRole } from '@/lib/session';

export function AppShell({
  role,
  name,
  firstName,
  photoUrl,
  yearLabel,
  sso,
  via,
  ssoSub,
  children,
}: {
  role: AppRole;
  name: string;
  /** ชื่อจริง — the avatar initial comes from this when there is no photo */
  firstName?: string;
  /** account photo endpoint, or null for accounts without a SchoolOS person */
  photoUrl?: string | null;
  yearLabel?: string;
  /** where SchoolOS is, for the keeper and the logout button */
  sso: SsoConfig;
  /** how this session started — only an SSO one has a platform session to keep */
  via?: string;
  /** whose SchoolOS session this one came from, for the guard to check against */
  ssoSub?: string;
  children: React.ReactNode;
}) {
  const nav = navFor(role);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Both render nothing in the ordinary case, and both are mounted here so
          they cover every signed-in page: the keeper for its timers, the guard
          to catch a session that is still ours but no longer this browser's. */}
      <SessionKeeper sso={sso} via={via} />
      <SessionGuard sso={sso} via={via} ssoSub={ssoSub} />

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
          firstName={firstName}
          photoUrl={photoUrl}
          nav={nav}
          sso={sso}
          via={via}
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
              firstName={firstName}
              photoUrl={photoUrl}
              nav={nav}
              sso={sso}
              via={via}
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
            <AccountMenu
              role={role}
              name={name}
              firstName={firstName}
              photoUrl={photoUrl}
              sso={sso}
              via={via}
            />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

function NavLink({
  item,
  active,
  collapsed,
  nested = false,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  /** a link inside a group — indented under a rule, so it drops its icon */
  nested?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
        collapsed && 'justify-center px-0',
        nested && 'py-2',
        active ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
      )}
    >
      {nested && !collapsed ? null : item.icon}
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
    </Link>
  );
}

/**
 * A heading that opens onto its links. A shut group whose page is open keeps a
 * faint highlight, so the menu still says where you are without being unfolded.
 */
function Group({
  group,
  open,
  hasActive,
  onToggle,
  isActive,
  onNavigate,
}: {
  group: NavGroup;
  open: boolean;
  hasActive: boolean;
  onToggle: () => void;
  isActive: (href: string) => boolean;
  onNavigate?: () => void;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
          hasActive && !open
            ? 'bg-white/10 text-white'
            : 'text-white/70 hover:bg-white/10 hover:text-white',
        )}
      >
        {group.icon}
        <span className="truncate">{group.label}</span>
        <ChevronDown
          className={cn('ml-auto size-4 shrink-0 transition-transform', open && 'rotate-180')}
          strokeWidth={2}
        />
      </button>
      {open ? (
        <div className="ml-5 mt-1 space-y-0.5 border-l border-white/10 pl-2">
          {group.items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(item.href)}
              collapsed={false}
              nested
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SidebarContent({
  role,
  name,
  firstName,
  photoUrl,
  nav,
  sso,
  via,
  collapsed,
  onToggle,
  onNavigate,
  onClose,
}: {
  role: AppRole;
  name: string;
  firstName?: string;
  photoUrl?: string | null;
  nav: NavEntry[];
  sso: SsoConfig;
  /** how this session started — only an SSO one is ours to end at SchoolOS */
  via?: string;
  collapsed: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  /** Groups the user has opened or shut by hand; the rest follow the route. */
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const { logout, leaving } = useLogout({ sso, via });

  // Exact match for dashboards and for any entry that has sub-entries of its
  // own: /attendance/view, /attendance/print and /results/subject are separate
  // nav items, so their parents must not light up when a child is open.
  const exact = new Set([`/${role}`, '/attendance', '/results']);
  const isActive = (href: string) =>
    exact.has(href) ? pathname === href : pathname.startsWith(href);

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

      {/*
        Collapsed to icons there is no room for a heading, and a group would
        cost a press to reach a link that is already one icon away — so the
        narrow sidebar flattens, keeping only a rule where each group ended.
      */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {collapsed
          ? nav.map((entry, i) => (
              <div
                key={isGroup(entry) ? entry.label : entry.href}
                className={cn('space-y-1', i > 0 && isGroup(entry) && 'mt-2 border-t border-white/8 pt-2')}
              >
                {itemsOf(entry).map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    active={isActive(item.href)}
                    collapsed
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            ))
          : nav.map((entry) => {
              if (!isGroup(entry))
                return (
                  <NavLink
                    key={entry.href}
                    item={entry}
                    active={isActive(entry.href)}
                    collapsed={false}
                    onNavigate={onNavigate}
                  />
                );

              const hasActive = entry.items.some((i) => isActive(i.href));
              const open = toggled[entry.label] ?? hasActive;
              return (
                <Group
                  key={entry.label}
                  group={entry}
                  open={open}
                  hasActive={hasActive}
                  onToggle={() => setToggled((t) => ({ ...t, [entry.label]: !open }))}
                  isActive={isActive}
                  onNavigate={onNavigate}
                />
              );
            })}
      </nav>

      <div className="border-t border-white/8 p-3">
        {!collapsed ? (
          <div className="mb-2 flex items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-white/8">
            <Avatar
              src={photoUrl}
              name={firstName || name}
              className="size-8 bg-[#F5C518] text-xs font-semibold text-[#241b04]"
            />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-medium text-white">{name}</p>
              <p className="truncate text-xs text-white/50">{roleLabel[role]}</p>
            </div>
          </div>
        ) : null}
        <div className={cn('flex gap-2', collapsed && 'flex-col')}>
          <button
            onClick={logout}
            disabled={leaving}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-60"
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
