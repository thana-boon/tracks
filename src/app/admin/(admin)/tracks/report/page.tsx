import { requireRole } from '@/lib/authz';
import { allYears } from '@/lib/years';
import { resolveTerm, trackReportFor } from '@/lib/tracks';
import { NeedYear } from '@/components/ui';
import { ReportView } from './report-view';

export const metadata = { title: 'รายงานสรุปการเลือก Track' };

/**
 * รายงานสรุปการเลือก Track — the read-only counterpart to
 * /admin/tracks/students, which is where a choice is *changed*.
 *
 * Split apart on purpose: the screen that edits one student at a time and the
 * screen the ผู้อำนวยการ is shown answer different questions, and a page that
 * tries to be both puts an ล้างการเลือก button next to a number somebody is
 * reading out loud in a meeting.
 */
export default async function TrackReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; semester?: string }>;
}) {
  await requireRole('admin');
  const sp = await searchParams;
  const years = await allYears();
  if (!years.length) return <NeedYear />;

  const term = await resolveTerm(Number(sp.year) || null, Number(sp.semester) || null);
  if (!term) return <NeedYear />;

  const report = await trackReportFor(term);
  return <ReportView report={report} years={years.map((y) => ({ id: y.id, year: y.year }))} />;
}
