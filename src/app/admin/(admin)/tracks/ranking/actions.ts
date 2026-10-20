'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/authz';
import { dropScoreCache } from '@/lib/score-api';

/** ดึงคะแนนล่าสุด — forget the cached copy so the page asks the score service again. */
export async function refreshScores(year: string) {
  await requireRole('admin');
  dropScoreCache(year);
  revalidatePath('/admin/tracks/ranking');
}
