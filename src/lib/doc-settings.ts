import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { documentSettings } from '@/db/schema';

/**
 * ตั้งค่าเอกสาร — the letterhead and signature block a printed transcript
 * carries. One row, always id 1.
 *
 * Reads never require the row to exist: an admin who has not opened หน้า
 * ตั้งค่าเอกสาร yet must still be able to print something sensible, so the
 * defaults below stand in until they save. That also means the transcript
 * never has to branch on "settings not configured".
 */
export const SETTINGS_ID = 1;

export interface DocSettings {
  schoolName: string;
  documentTitle: string;
  documentSubtitle: string | null;
  logo: string | null;
  directorName: string | null;
  directorTitle: string;
  directorSignature: string | null;
  registrarName: string | null;
  registrarTitle: string;
  registrarSignature: string | null;
  updatedBy: string | null;
  updatedAt: Date | null;
}

export const DEFAULT_DOC_SETTINGS: DocSettings = {
  schoolName: 'โรงเรียนสุคนธีรวิทย์',
  documentTitle: 'ผลการเรียนวิชาเสริม',
  documentSubtitle: 'ระเบียนสะสมผลการเรียนวิชาเสริม ระดับชั้น ม.4 - ม.6',
  logo: null,
  directorName: null,
  directorTitle: 'ผู้อำนวยการโรงเรียน',
  directorSignature: null,
  registrarName: null,
  registrarTitle: 'นายทะเบียนวัดผล',
  registrarSignature: null,
  updatedBy: null,
  updatedAt: null,
};

/** The saved settings, falling back field-by-field to the defaults. */
export async function docSettings(): Promise<DocSettings> {
  const [row] = await db
    .select()
    .from(documentSettings)
    .where(eq(documentSettings.id, SETTINGS_ID))
    .limit(1);
  if (!row) return DEFAULT_DOC_SETTINGS;
  return {
    schoolName: row.schoolName || DEFAULT_DOC_SETTINGS.schoolName,
    documentTitle: row.documentTitle || DEFAULT_DOC_SETTINGS.documentTitle,
    documentSubtitle: row.documentSubtitle,
    logo: row.logo,
    directorName: row.directorName,
    directorTitle: row.directorTitle || DEFAULT_DOC_SETTINGS.directorTitle,
    directorSignature: row.directorSignature,
    registrarName: row.registrarName,
    registrarTitle: row.registrarTitle || DEFAULT_DOC_SETTINGS.registrarTitle,
    registrarSignature: row.registrarSignature,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
  };
}
