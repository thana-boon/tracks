'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * App-wide modal dialogs — the one place a confirmation or an outcome is shown.
 *
 * Replaces both `window.confirm` (unstyled, blocks the tab, no Thai typography)
 * and the toast pop-ups that used to scroll past before an admin had read them.
 * Anything the admin has to acknowledge — "this deletes recorded results",
 * "24 events drawn, 2 skipped" — belongs here.
 *
 *   const dialog = useDialog();
 *   if (!(await dialog.confirm({ title: 'ลบทั้งหมด?', tone: 'destructive' }))) return;
 *   dialog.message({ title: 'ลบแล้ว', tone: 'success' });
 */

export type DialogTone = 'default' | 'destructive' | 'success';

interface BaseOptions {
  title: string;
  description?: string;
  /** Extra lines — per-item results, skipped rows, error details. */
  detail?: string[];
  tone?: DialogTone;
}

export interface ConfirmOptions extends BaseOptions {
  confirmLabel?: string;
  cancelLabel?: string;
}

type Request =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: 'message'; options: BaseOptions; resolve: (ok: boolean) => void };

interface DialogApi {
  /** Resolves true when the admin confirms, false on cancel/Esc/backdrop. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Resolves once acknowledged — await it only when you need to sequence. */
  message: (options: BaseOptions) => Promise<boolean>;
}

const DialogContext = React.createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const api = React.useContext(DialogContext);
  if (!api) throw new Error('useDialog must be used inside <DialogProvider>');
  return api;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  // A queue, not a single slot: an action that reports an outcome right after a
  // confirmation would otherwise drop the first dialog's resolver on the floor.
  const [queue, setQueue] = React.useState<Request[]>([]);
  const current = queue[0] ?? null;

  const push = React.useCallback((req: Omit<Request, 'resolve'>) => {
    return new Promise<boolean>((resolve) => {
      setQueue((q) => [...q, { ...req, resolve } as Request]);
    });
  }, []);

  const api = React.useMemo<DialogApi>(
    () => ({
      confirm: (options) => push({ kind: 'confirm', options }),
      message: (options) => push({ kind: 'message', options }),
    }),
    [push],
  );

  // Resolve outside the state updater — React may call an updater more than once
  // in development, and settling a promise is not something to replay.
  const close = (ok: boolean) => {
    current?.resolve(ok);
    setQueue((q) => q.slice(1));
  };

  return (
    <DialogContext.Provider value={api}>
      {children}
      {current ? (
        <Modal
          onClose={() => close(false)}
          labelledBy="app-dialog-title"
          footer={
            current.kind === 'confirm' ? (
              <>
                <Button variant="outline" onClick={() => close(false)}>
                  {current.options.cancelLabel ?? 'ยกเลิก'}
                </Button>
                <Button
                  autoFocus
                  variant={current.options.tone === 'destructive' ? 'destructive' : 'primary'}
                  onClick={() => close(true)}
                >
                  {current.options.confirmLabel ?? 'ยืนยัน'}
                </Button>
              </>
            ) : (
              <Button autoFocus onClick={() => close(true)}>
                ปิด
              </Button>
            )
          }
        >
          <DialogBody {...current.options} titleId="app-dialog-title" />
        </Modal>
      ) : null}
    </DialogContext.Provider>
  );
}

/** Tone icon + title + description + detail lines — shared by every dialog. */
export function DialogBody({
  title,
  description,
  detail,
  tone = 'default',
  titleId,
}: BaseOptions & { titleId?: string }) {
  const icons: Record<DialogTone, React.ReactNode> = {
    default: <Info className="size-5" strokeWidth={1.9} />,
    destructive: <AlertTriangle className="size-5" strokeWidth={1.9} />,
    success: <CheckCircle2 className="size-5" strokeWidth={1.9} />,
  };
  const tones: Record<DialogTone, string> = {
    default: 'bg-primary/10 text-primary',
    destructive: 'bg-destructive/10 text-destructive',
    success: 'bg-success/10 text-success',
  };

  return (
    <div className="flex gap-3.5">
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', tones[tone])}>
        {icons[tone]}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <h2 id={titleId} className="text-base font-semibold leading-snug">
          {title}
        </h2>
        {description ? (
          <p className="whitespace-pre-line text-sm text-muted-foreground">{description}</p>
        ) : null}
        {detail?.length ? (
          <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border/60 bg-secondary/30 p-2.5 text-xs text-muted-foreground">
            {detail.map((line, i) => (
              <li key={i} className="truncate" title={line}>
                {line}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The modal shell: backdrop, panel, Esc-to-close and a focus trap. Rendered in a
 * portal so a dialog opened from deep inside a card is never clipped by an
 * `overflow-hidden` ancestor.
 *
 * `onClose` of undefined makes the dialog non-dismissable — used while a draw
 * is running, so nothing is closed mid-write.
 */
export function Modal({
  children,
  footer,
  onClose,
  labelledBy,
  className,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose?: () => void;
  labelledBy?: string;
  className?: string;
}) {
  const [mounted, setMounted] = React.useState(false);
  const panel = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Keep the page behind the backdrop from scrolling under the dialog.
  React.useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Tab cycles inside the panel while the dialog owns the screen.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !panel.current) return;
    const focusable = panel.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center p-4" role="presentation">
      <div
        className="anim-dialog-fade absolute inset-0 bg-[#1a1625]/45 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onKeyDown={onKeyDown}
        className={cn(
          'anim-scale-in relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl',
          className,
        )}
      >
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="absolute right-3 top-3 grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
          >
            <X className="size-4" strokeWidth={1.9} />
          </button>
        ) : null}
        <div className="p-5 pr-12 sm:p-6 sm:pr-12">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 bg-secondary/20 px-5 py-3.5 sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/** Inline spinner for dialog footers that keep working after a click. */
export function DialogSpinner() {
  return <Loader2 className="size-4 animate-spin" />;
}
