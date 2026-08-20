'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SsoConfig } from '@/lib/sso-client';
import { Avatar } from './avatar';
import { useLogout } from './use-logout';
import { roleLabel } from './nav-config';
import type { AppRole } from '@/lib/session';

/**
 * The account photo in the header, and what sits under it.
 *
 * The photo was the one thing on the page that looked pressable and was not —
 * on a phone, where the sidebar is folded away behind the ☰, it is also the
 * only account control in sight. Pressing it now opens the menu that ends the
 * session, so signing out never depends on finding the drawer first.
 */
export function AccountMenu({
  role,
  name,
  firstName,
  photoUrl,
  sso,
  via,
}: {
  role: AppRole;
  name: string;
  firstName?: string;
  photoUrl?: string | null;
  sso: SsoConfig;
  via?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const { logout, leaving } = useLogout({ sso, via });

  // Anywhere else on the page, or Esc, shuts it — the ordinary way out of a
  // menu somebody opened by accident.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="บัญชีผู้ใช้"
        className={cn(
          'flex items-center gap-3 rounded-xl py-1 pl-2 pr-1.5 transition-colors hover:bg-secondary/60',
          open && 'bg-secondary/60',
        )}
      >
        <span className="hidden text-right sm:block">
          <span className="block text-sm font-medium leading-tight">{name}</span>
          <span className="block text-xs text-muted-foreground">{roleLabel[role]}</span>
        </span>
        <Avatar
          src={photoUrl}
          name={firstName || name}
          className="size-9 bg-primary text-sm font-semibold text-[#F5C518]"
        />
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
          strokeWidth={2}
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-lg anim-fade-up"
        >
          {/* On a phone the header hides the name, so the menu carries it. */}
          <div className="border-b border-border px-3 py-2.5 leading-tight sm:hidden">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{roleLabel[role]}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={logout}
            disabled={leaving}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-secondary/60 disabled:opacity-60"
          >
            <LogOut className="size-4.5 shrink-0" strokeWidth={1.7} />
            ออกจากระบบ
          </button>
        </div>
      ) : null}
    </div>
  );
}
