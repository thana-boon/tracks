'use client';

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui';
import { useDialog } from './dialog';

export interface ActionResult {
  ok: boolean;
  message: string;
}

/**
 * A button that runs a server action returning {ok, message} and toasts the
 * result. Optionally confirms first. Keeps the pattern in one place so every
 * sync/delete/assign button behaves identically.
 */
export function ActionButton({
  action,
  children,
  confirm,
  variant = 'primary',
  size = 'md',
  className,
  icon,
  onDone,
}: {
  action: () => Promise<ActionResult>;
  children: React.ReactNode;
  confirm?: { title: string; description?: string; tone?: 'default' | 'destructive' };
  variant?: 'primary' | 'accent' | 'secondary' | 'ghost' | 'destructive' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  icon?: React.ReactNode;
  onDone?: (r: ActionResult) => void;
}) {
  const [pending, start] = useTransition();
  const [running, setRunning] = useState(false);
  const dialog = useDialog();
  const busy = pending || running;

  async function run() {
    if (busy) return;
    if (confirm) {
      const ok = await dialog.confirm({
        title: confirm.title,
        description: confirm.description,
        tone: confirm.tone,
      });
      if (!ok) return;
    }
    setRunning(true);
    try {
      const r = await action();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      onDone?.(r);
    } catch {
      toast.error('เกิดข้อผิดพลาด');
    } finally {
      setRunning(false);
      start(() => {});
    }
  }

  return (
    <Button variant={variant} size={size} className={className} disabled={busy} onClick={run}>
      {busy ? <Loader2 className="size-4.5 animate-spin" /> : icon}
      {children}
    </Button>
  );
}
