'use client';

import { useEffect } from 'react';
import { Printer } from 'lucide-react';

/**
 * Opens the print dialog once the page has its fonts — print any sooner and
 * the Thai comes out in a fallback face — and leaves a button for a second go.
 * Gone from the paper itself.
 */
export function PrintBar() {
  useEffect(() => {
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled) window.print();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-[#d9d2e6] bg-white/95 px-6 py-3 print:hidden">
      <p className="text-sm text-[#6b6478]">
        เลือกปลายทาง <span className="font-medium text-[#1a1625]">บันทึกเป็น PDF</span> ในหน้าต่างพิมพ์
        เพื่อเก็บเป็นไฟล์
      </p>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#5b2d8e] px-4 text-sm font-medium text-white hover:opacity-90"
      >
        <Printer className="size-4.5" strokeWidth={1.8} />
        พิมพ์ / บันทึกเป็น PDF
      </button>
    </div>
  );
}
