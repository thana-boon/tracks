import 'server-only';
import { NextResponse } from 'next/server';
import { RenderBusyError } from './render-queue';

/**
 * The one place a generated document turns into an HTTP response.
 *
 * Two things every export needs and each route used to spell out (or forget):
 *
 *  - Content-Disposition is Latin-1 only, so a Thai filename has to travel in
 *    the RFC 5987 `filename*` while an ASCII fallback fills `filename`.
 *  - `no-store`. These are ทรานสคริปต์ and ใบรายชื่อ — they carry every
 *    student's name and result, and the machines they print from are shared
 *    staff-room computers. Without it the browser is free to leave a copy in
 *    its disk cache for the next person who opens the same URL.
 */
export function pdfResponse(
  buffer: Buffer | Uint8Array,
  { asciiName, thaiName }: { asciiName: string; thaiName: string },
): NextResponse {
  const utf8 = encodeURIComponent(`${thaiName}.pdf`);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${asciiName}"; filename*=UTF-8''${utf8}`,
      'Cache-Control': 'private, no-store, must-revalidate',
    },
  });
}

/**
 * The answer when the render queue is full. 503 + Retry-After is what tells a
 * browser (and a person) that trying again shortly is the right move.
 */
export function busyResponse(): NextResponse {
  return NextResponse.json(
    { error: 'กำลังสร้างเอกสารให้ผู้ใช้อื่นอยู่ — รอสักครู่แล้วลองใหม่อีกครั้ง' },
    { status: 503, headers: { 'Retry-After': '30' } },
  );
}

/** Narrow the queue's own error so a route can answer 503 rather than 500. */
export function isBusy(e: unknown): boolean {
  return e instanceof RenderBusyError;
}
