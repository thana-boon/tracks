import { Users } from 'lucide-react';
import { requireRole } from '@/lib/authz';
import { activeYear } from '@/lib/years';
import { buildTranscripts } from '@/lib/transcript';
import { listHomerooms, studentsByRoom, type Homeroom } from '@/lib/homeroom';
import { classDaysOfYear } from '@/lib/subjects-for-user';
import { Card, CardHeader, Badge, EmptyState, NeedYear, resultTone } from '@/components/ui';
import { OVERALL_LABEL } from '@/lib/evaluate';
import { RoomSwitcher } from './room-switcher';
import { ReportExport } from './report-export';

export const metadata = { title: 'ห้องที่ปรึกษา' };

/**
 * ห้องที่ปรึกษา — ครูเห็นเฉพาะห้องของตัวเอง, admin เลือกดูได้ทุกห้อง.
 *
 * Two separate controls on purpose: `?room=` picks the single ห้อง on screen
 * (one click to switch), while the export panel keeps its own multi-room tick
 * list. Sharing one control made changing rooms mean untickng the old one.
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
          hint="ระบบซิงก์ครูที่ปรึกษาจาก SchoolOS — หากคิดว่าผิดพลาด ติดต่อผู้ดูแล"
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
  const [transcripts, classDays] = await Promise.all([
    buildTranscripts(year, [...byRoom.values()].flat()),
    isAdmin ? classDaysOfYear(year) : Promise.resolve([]),
  ]);
  const transcriptBy = new Map(transcripts.map((t) => [t.student.id, t]));
  const months = [...new Set(classDays.map((d) => d.date.slice(0, 7)))];

  return (
    <div className="space-y-6">
      <Header isAdmin={isAdmin} />
      {viewing ? (
        <>
          <RoomSwitcher rooms={rooms} current={viewing.key} />
          {/* Keyed on the room in view: switching rooms should re-arm the export
              on that room, never quietly leave the previous one ticked. */}
          <ReportExport
            key={viewing.key}
            rooms={rooms}
            months={months}
            viewing={viewing.key}
          />
        </>
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

function Header({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">ห้องที่ปรึกษา</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {isAdmin
          ? 'เลือกห้องเพื่อดูว่านักเรียนเรียนวิชาเสริมอะไรและผ่าน/ไม่ผ่าน · การออกรายงาน PDF แยกอีกส่วนหนึ่ง เลือกได้หลายห้องโดยไม่กระทบห้องที่กำลังดู'
          : 'ดูว่านักเรียนในห้องที่ปรึกษาของคุณเรียนวิชาเสริมอะไร และผ่าน/ไม่ผ่าน — อ่านอย่างเดียว'}
      </p>
    </div>
  );
}
