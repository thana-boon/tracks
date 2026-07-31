import Link from 'next/link';
import { Users, FileDown, CalendarCheck } from 'lucide-react';
import { requireRole } from '@/lib/authz';
import { activeYear } from '@/lib/years';
import { buildYearResults } from '@/lib/transcript';
import { listHomerooms, studentsByRoom, type Homeroom } from '@/lib/homeroom';
import { Card, CardHeader, Badge, Button, EmptyState, NeedYear, resultTone } from '@/components/ui';
import { RoomSwitcher } from '@/components/room-switcher';
import { OVERALL_LABEL } from '@/lib/evaluate';

export const metadata = { title: 'ห้องที่ปรึกษา' };

/**
 * ห้องที่ปรึกษา — ครูเห็นเฉพาะห้องของตัวเอง, admin เลือกดูได้ทุกห้อง.
 *
 * Reading and printing are two different jobs and now live on two pages: this
 * one shows a single ห้อง (`?room=`), and the PDF button hands off to
 * /homeroom/report with that room pre-ticked. They used to share a screen, and
 * the tick list of every room in the school crowded out the ห้อง being read.
 */
export default async function HomeroomPage({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const user = await requireRole('admin', 'teacher');
  const year = await activeYear();
  if (!year) return <NeedYear />;

  const isAdmin = user.role === 'admin';
  if (!isAdmin && !user.personId)
    return <EmptyState title="ไม่พบข้อมูลครู" hint="ต้องซิงก์รายชื่อครูก่อน — ติดต่อผู้ดูแล" />;

  const rooms = await listHomerooms(year, isAdmin ? undefined : user.personId!);

  if (rooms.length === 0)
    return (
      <div className="space-y-6">
        <Header isAdmin={isAdmin} />
        <EmptyState
          icon={<Users className="size-8" strokeWidth={1.5} />}
          title={isAdmin ? 'ยังไม่มีห้องที่ปรึกษาในปีนี้' : 'คุณยังไม่ได้เป็นครูที่ปรึกษาห้องใด'}
          hint="ระบบซิงก์ครูที่ปรึกษาจาก SchoolOS ให้อัตโนมัติ — หากคิดว่าผิดพลาด ติดต่อผู้ดูแล"
        />
      </div>
    );

  // A teacher always sees every room they advise; an admin reads one at a time,
  // so the page never loads the whole school to show a single ห้อง.
  const sp = await searchParams;
  const viewing = isAdmin
    ? rooms.find((r) => r.key === sp.room?.trim()) ?? rooms[0]
    : null;
  const shown: Homeroom[] = viewing ? [viewing] : rooms;

  const byRoom = await studentsByRoom(shown);
  const results = await buildYearResults(year, [...byRoom.values()].flat());
  const transcriptBy = new Map(results.map((t) => [t.student.id, t]));

  return (
    <div className="space-y-6">
      <Header isAdmin={isAdmin} viewing={viewing?.key ?? null} />
      {viewing ? (
        <RoomSwitcher rooms={rooms} current={viewing.key} basePath="/homeroom" />
      ) : null}

      {shown.map((room) => {
          const list = (byRoom.get(room.key) ?? [])
            .map((id) => transcriptBy.get(id))
            .filter((t): t is NonNullable<typeof t> => Boolean(t));
          return (
            <Card key={room.key}>
              <CardHeader
                icon={<Users className="size-4.5" strokeWidth={1.8} />}
                title={`ห้อง ${room.key}`}
                action={
                  <div className="flex items-center gap-2">
                    {room.teacherNames.length > 0 ? (
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        ครู {room.teacherNames.join(', ')}
                      </span>
                    ) : null}
                    <Badge tone="navy">{list.length} คน</Badge>
                  </div>
                }
              />
              {list.length === 0 ? (
                <div className="px-4 pb-5 sm:px-5">
                  <EmptyState title="ไม่มีนักเรียนในห้องนี้" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="px-4 py-2.5 text-left font-medium">นักเรียน</th>
                        <th className="px-4 py-2.5 text-left font-medium">วิชาเสริม · ผลการเรียน</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {list.map((t) => (
                        <tr key={t.student.id} className="hover:bg-secondary/40">
                          <td className="px-4 py-2.5 align-top">
                            <p className="truncate font-medium">{t.student.fullName}</p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {t.student.code}
                            </p>
                          </td>
                          <td className="px-4 py-2.5">
                            {t.lines.length === 0 ? (
                              <span className="text-xs text-muted-foreground">ยังไม่ได้ลงวิชาเสริม</span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {t.lines.map((l, i) => (
                                  <span
                                    key={i}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 text-xs"
                                  >
                                    <span className="font-medium">{l.subjectCode}</span>
                                    <Badge tone={resultTone(l.overall)}>
                                      {OVERALL_LABEL[l.overall]}
                                    </Badge>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </Card>
        );
      })}
    </div>
  );
}

function Header({ isAdmin, viewing }: { isAdmin: boolean; viewing?: string | null }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ห้องที่ปรึกษา</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isAdmin
            ? 'เลือกห้องเพื่อดูว่านักเรียนเรียนวิชาเสริมอะไรและผ่าน/ไม่ผ่าน'
            : 'ดูว่านักเรียนในห้องที่ปรึกษาของคุณเรียนวิชาเสริมอะไร และผ่าน/ไม่ผ่าน — อ่านอย่างเดียว'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/results">
          <Button variant="outline">
            <CalendarCheck className="size-4.5" strokeWidth={1.8} />
            เวลาเข้าเรียน
          </Button>
        </Link>
        {isAdmin ? (
          <Link href={viewing ? `/homeroom/report?room=${encodeURIComponent(viewing)}` : '/homeroom/report'}>
            <Button>
              <FileDown className="size-4.5" strokeWidth={1.8} />
              ออกรายงาน PDF
            </Button>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
