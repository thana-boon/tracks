import { and, asc, eq, inArray } from 'drizzle-orm';
import { Users } from 'lucide-react';
import { db } from '@/db';
import { homerooms, people } from '@/db/schema';
import { requireRole } from '@/lib/authz';
import { activeYear } from '@/lib/years';
import { buildTranscripts } from '@/lib/transcript';
import { Card, CardHeader, Badge, EmptyState, NeedYear, resultTone } from '@/components/ui';
import { OVERALL_LABEL } from '@/lib/evaluate';

export const metadata = { title: 'ห้องที่ปรึกษา · Track' };

export default async function HomeroomPage() {
  const user = await requireRole('teacher');
  const year = await activeYear();
  if (!year) return <NeedYear />;

  if (!user.personId)
    return <EmptyState title="ไม่พบข้อมูลครู" hint="ต้องซิงก์รายชื่อครูก่อน — ติดต่อผู้ดูแล" />;

  const rooms = await db
    .select({ gradeLevel: homerooms.gradeLevel, classroom: homerooms.classroom })
    .from(homerooms)
    .where(and(eq(homerooms.yearId, year.id), eq(homerooms.teacherId, user.personId)))
    .orderBy(asc(homerooms.gradeLevel), asc(homerooms.classroom));

  if (rooms.length === 0)
    return (
      <div className="space-y-6">
        <Header />
        <EmptyState
          icon={<Users className="size-8" strokeWidth={1.5} />}
          title="คุณยังไม่ได้เป็นครูที่ปรึกษาห้องใด"
          hint="ระบบซิงก์ครูที่ปรึกษาจาก SchoolOS — หากคิดว่าผิดพลาด ติดต่อผู้ดูแล"
        />
      </div>
    );

  // Collect students across all advised rooms, then build transcripts once.
  const studentRows = await db
    .select({ id: people.id, gradeLevel: people.gradeLevel, classroom: people.classroom })
    .from(people)
    .where(
      and(
        eq(people.type, 'student'),
        eq(people.status, 'studying'),
        inArray(
          people.gradeLevel,
          rooms.map((r) => r.gradeLevel),
        ),
      ),
    );

  const roomKey = new Set(rooms.map((r) => `${r.gradeLevel}|${r.classroom}`));
  const mine = studentRows.filter((s) => roomKey.has(`${s.gradeLevel}|${s.classroom}`));
  const transcripts = await buildTranscripts(year, mine.map((s) => s.id));

  // Group transcripts by room.
  const byRoom = new Map<string, typeof transcripts>();
  for (const t of transcripts) {
    const key = `${t.student.gradeLevel}|${t.student.classroom}`;
    const arr = byRoom.get(key) ?? [];
    arr.push(t);
    byRoom.set(key, arr);
  }

  return (
    <div className="space-y-6">
      <Header />
      {rooms.map((room) => {
        const key = `${room.gradeLevel}|${room.classroom}`;
        const list = byRoom.get(key) ?? [];
        return (
          <Card key={key}>
            <CardHeader
              icon={<Users className="size-4.5" strokeWidth={1.8} />}
              title={`ห้อง ${room.gradeLevel}/${room.classroom}`}
              action={<Badge tone="navy">{list.length} คน</Badge>}
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
                          <p className="text-xs text-muted-foreground tabular-nums">{t.student.code}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          {t.lines.length === 0 ? (
                            <span className="text-xs text-muted-foreground">ยังไม่ได้ลงวิชาเสริม</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {t.lines.map((l, i) => (
                                <span key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 text-xs">
                                  <span className="font-medium">{l.subjectCode}</span>
                                  <Badge tone={resultTone(l.overall)}>{OVERALL_LABEL[l.overall]}</Badge>
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

function Header() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">ห้องที่ปรึกษา</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        ดูว่านักเรียนในห้องที่ปรึกษาของคุณเรียนวิชาเสริมอะไร และผ่าน/ไม่ผ่าน — อ่านอย่างเดียว
      </p>
    </div>
  );
}
