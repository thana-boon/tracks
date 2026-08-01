import * as React from 'react';
import { cn } from '@/lib/utils';

/** Card — rounded-2xl + border + shadow-xs, no border-left accents (per CI). */
export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-card text-card-foreground shadow-xs',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  icon,
  title,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  // Wraps rather than overflows: a Thai title plus a badge like
  // "ทั้งปี ยังเช็คไม่ครบ 12 กลุ่ม" is wider than a phone, and a header that
  // refuses to break pushes the whole page sideways — every card on every
  // screen shares this row, so it has to give way on its own.
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 p-4 sm:p-5', className)}>
      <div className="flex min-w-0 items-center gap-3">
        {icon ? (
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </span>
        ) : null}
        <h2 className="min-w-0 text-sm font-semibold sm:text-base">{title}</h2>
      </div>
      {action ? (
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          {action}
        </div>
      ) : null}
    </div>
  );
}

type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'destructive' | 'outline';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  accent: 'bg-accent text-accent-foreground hover:brightness-95',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
  ghost: 'text-foreground hover:bg-secondary/60',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  outline: 'border border-border bg-card hover:bg-secondary/60',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizes = {
    sm: 'h-9 px-3 text-sm',
    md: 'h-10 px-4 text-sm',
    lg: 'h-11 px-5 text-base',
  };
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
        buttonVariants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary',
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    // min-w-0: a <select> is intrinsically as wide as its longest <option>, so
    // a รอบเรียน label like "ก1 · TR101 — ... (รอบ ก)" would otherwise refuse to
    // shrink inside a flex row and push the page past the edge of a phone.
    <select
      className={cn(
        'h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:border-primary',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full min-w-0 rounded-lg border border-input bg-card px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary',
        className,
      )}
      {...props}
    />
  );
}

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('mb-1.5 block text-sm font-medium text-foreground', className)}
      {...props}
    />
  );
}

type BadgeTone = 'primary' | 'accent' | 'success' | 'destructive' | 'navy' | 'secondary';

export function Badge({
  tone = 'secondary',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  const tones: Record<BadgeTone, string> = {
    primary: 'bg-primary/10 text-primary',
    accent: 'bg-[#F5C518]/15 text-[#8a6a00]',
    success: 'bg-success/10 text-success',
    destructive: 'bg-destructive/10 text-destructive',
    navy: 'bg-navy/10 text-navy',
    secondary: 'bg-secondary text-secondary-foreground',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
      className,
      )}
      {...props}
    />
  );
}

/** Badge tone for a computed overall result. */
export function resultTone(overall: 'excellent' | 'pass' | 'fail' | 'pending'):
  | 'accent'
  | 'success'
  | 'destructive'
  | 'secondary' {
  switch (overall) {
    case 'excellent':
      return 'accent';
    case 'pass':
      return 'success';
    case 'fail':
      return 'destructive';
    default:
      return 'secondary';
  }
}

/** Shown on admin subpages when no academic year has been synced yet. */
export function NeedYear() {
  return (
    <EmptyState
      title="ยังไม่ได้ซิงก์ปีการศึกษา"
      hint="ไปที่หน้าปีการศึกษาเพื่อซิงก์ปฏิทินจาก SchoolOS ก่อน จึงจะจัดการส่วนนี้ได้"
      action={
        <a
          href="/admin/years"
          className="mt-2 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          ไปที่ปีการศึกษา
        </a>
      }
    />
  );
}

/** Empty state — descriptive, never a bare "no data". */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
      {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-muted-foreground">{hint}</p> : null}
      {action}
    </div>
  );
}
