import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { trackGroups, trackSubjects } from '@/db/schema';
import { GroupsManager, type GroupItem } from './groups-manager';

export const metadata = { title: 'กลุ่มวิชา · Track' };

export default async function GroupsPage() {
  const rows = await db
    .select({
      id: trackGroups.id,
      code: trackGroups.code,
      name: trackGroups.name,
      description: trackGroups.description,
      active: trackGroups.active,
      subjectCount: sql<number>`count(${trackSubjects.id})`,
    })
    .from(trackGroups)
    .leftJoin(trackSubjects, eq(trackSubjects.groupId, trackGroups.id))
    .groupBy(trackGroups.id)
    .orderBy(asc(trackGroups.code));

  const groups: GroupItem[] = rows.map((r) => ({ ...r, subjectCount: Number(r.subjectCount) }));
  return <GroupsManager groups={groups} />;
}
