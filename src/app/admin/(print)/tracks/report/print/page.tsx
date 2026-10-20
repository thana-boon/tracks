import type { Metadata } from 'next';
import { requireRole } from '@/lib/authz';
import { resolveTerm, trackReportFor } from '@/lib/tracks';
import { parseReportPart, reportFileName, reportSheets } from '@/lib/track-report';
import type { Cell } from '@/lib/xlsx';
import { PrintBar } from './print-bar';

type Search = Promise<{ year?: string; semester?: string; part?: string }>;

async function load(searchParams: Search) {
  const sp = await searchParams;
  const term = await resolveTerm(Number(sp.year) || null, Number(sp.semester) || null);
  return { term, part: parseReportPart(sp.part ?? null) };
}

/**
 * The title is what the browser offers as the file name under "บันทึกเป็น PDF",
 * so it is the bare file name — no site branding after it.
 */
export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const { term, part } = await load(searchParams);
  if (!term) return { title: 'รายงานสรุปการเลือก Track' };
  return { title: { absolute: reportFileName(term, part, 'pdf').replace(/\.pdf$/, '') } };
}

function show(v: Cell): string {
  if (v === null || v === undefined) return '';
  return typeof v === 'number' ? v.toLocaleString('th-TH') : v;
}

/**
 * รายงานสรุปการเลือก Track, laid out to be printed — the PDF route.
 *
 * The browser makes the PDF (พิมพ์ → บันทึกเป็น PDF) rather than the server: a
 * whole-school report rendered by @react-pdf held the one render slot for
 * long enough to be a wait for everyone, and the browser's own layout already
 * wraps Thai properly and repeats the table head on every page for free. The
 * sheets are the very ones the .xlsx is built from, so the two never disagree.
 *
 * Its own route group, outside the (admin) shell: a sidebar has no business on
 * paper.
 */
export default async function TrackReportPrintPage({ searchParams }: { searchParams: Search }) {
  await requireRole('admin');
  const { term, part } = await load(searchParams);
  if (!term) return <p className="p-8 text-sm">ไม่พบภาคเรียนที่ขอ</p>;

  const sheets = reportSheets(await trackReportFor(term), part);
  const termLabel = `ปีการศึกษา ${term.year} ภาคเรียนที่ ${term.semester}`;

  return (
    <div className="track-print min-h-screen bg-white text-[#1a1625]">
      <style>{`
        @page { size: A4 landscape; margin: 10mm; }
        @media print {
          .track-print section + section { break-before: page; }
          .track-print tr { break-inside: avoid; }
          .track-print { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <PrintBar />
      <main className="mx-auto max-w-[1100px] px-6 py-6 print:max-w-none print:p-0">
        {sheets.length === 0 ? (
          <p className="text-sm text-[#6b6478]">ไม่มีรายการให้พิมพ์ในส่วนนี้</p>
        ) : null}
        {sheets.map((sheet, si) => (
          <section key={si} className="mb-10 print:mb-0">
            <header className="mb-3 flex items-end justify-between gap-4">
              <div>
                <p className="text-[11px] text-[#6b6478]">โรงเรียนสุคนธีรวิทย์</p>
                <h1 className="text-base font-bold text-[#5b2d8e]">
                  รายงานสรุปการเลือก Track — {sheet.name}
                </h1>
                <div className="mt-1 h-0.5 w-10 bg-[#f5c518]" />
              </div>
              <p className="text-right text-[11px] text-[#6b6478]">
                {termLabel}
                <br />
                {sheet.rows.filter((r) => r.length).length.toLocaleString('th-TH')} แถว
              </p>
            </header>
            <table className="w-full border-collapse text-[11px] leading-snug">
              {/* A <thead> repeats at the top of every printed page by itself. */}
              <thead>
                <tr className="bg-[#f1edf7]">
                  {sheet.header.map((h, i) => (
                    <th
                      key={i}
                      className="border border-[#d9d2e6] px-1.5 py-1 text-left font-semibold whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={sheet.header.length}
                      className="border border-[#d9d2e6] px-2 py-3 text-center text-[#6b6478]"
                    >
                      ไม่มีรายการ
                    </td>
                  </tr>
                ) : null}
                {sheet.rows.map((row, ri) =>
                  row.length === 0 ? (
                    <tr key={ri}>
                      <td colSpan={sheet.header.length} className="h-3 border border-[#d9d2e6]" />
                    </tr>
                  ) : (
                    <tr key={ri} className={ri % 2 ? 'bg-[#faf8fd]' : undefined}>
                      {sheet.header.map((_, i) => (
                        <td
                          key={i}
                          className={`border border-[#d9d2e6] px-1.5 py-0.5 ${typeof row[i] === 'number' ? 'text-right tabular-nums' : ''}`}
                        >
                          {show(row[i])}
                        </td>
                      ))}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </section>
        ))}
      </main>
    </div>
  );
}
