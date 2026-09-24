import { asc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { registrations, trackGroups, trackSubjects } from '@/db/schema';
import { requireCatalogEditor } from '@/lib/authz';
import { SubjectsManager, type SubjectItem, type GroupOption } from './subjects-manager';

export const metadata = { title: 'วิชาเสริม' };

export default async function SubjectsPage() {
  const user = await requireCatalogEditor();
  const [rows, groups] = await Promise.all([
    db
      .select({
        id: trackSubjects.id,
        code: trackSubjects.code,
        name: trackSubjects.name,
        teacherName: trackSubjects.teacherName,
        description: trackSubjects.description,
        active: trackSubjects.active,
        semester: trackSubjects.semester,
        phase: trackSubjects.phase,
        groupId: trackSubjects.groupId,
        groupCode: trackGroups.code,
        groupName: trackGroups.name,
        groupColor: trackGroups.color,
        studentCount: sql<number>`count(distinct ${registrations.studentId}) filter (where ${registrations.droppedAt} is null)`,
      })
      .from(trackSubjects)
      .innerJoin(trackGroups, eq(trackSubjects.groupId, trackGroups.id))
      .leftJoin(registrations, eq(registrations.subjectId, trackSubjects.id))
      .groupBy(trackSubjects.id, trackGroups.code, trackGroups.name, trackGroups.color)
      .orderBy(
        asc(trackGroups.code),
        sql`${trackSubjects.semester} nulls last`,
        sql`${trackSubjects.phase} nulls last`,
        asc(trackSubjects.code),
      ),
    db
      .select({
        id: trackGroups.id,
        code: trackGroups.code,
        name: trackGroups.name,
        color: trackGroups.color,
      })
      .from(trackGroups)
      .where(eq(trackGroups.active, true))
      .orderBy(asc(trackGroups.code)),
  ]);

  const subjects: SubjectItem[] = rows.map((r) => ({ ...r, studentCount: Number(r.studentCount) }));
  const groupOptions: GroupOption[] = groups;

  return (
    <SubjectsManager
      subjects={subjects}
      groups={groupOptions}
      // กลุ่มวิชา is a ผู้ดูแล screen — a moderator is not sent somewhere that
      // would turn them away.
      canManageGroups={user.role === 'admin'}
    />
  );
}
