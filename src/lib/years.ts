import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { academicYears } from '@/db/schema';

export interface YearRow {
  id: number;
  schoolosId: number;
  year: string;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
}

/** The active academic year (mirrored from the Users Service), or null. */
export async function activeYear(): Promise<YearRow | null> {
  const [y] = await db
    .select()
    .from(academicYears)
    .where(eq(academicYears.isActive, true))
    .limit(1);
  return y ?? null;
}

/** Every synced year, newest first. */
export async function allYears(): Promise<YearRow[]> {
  return db.select().from(academicYears).orderBy(desc(academicYears.year));
}
