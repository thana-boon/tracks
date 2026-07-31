'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db';
import { documentSettings } from '@/db/schema';
import { requireRole } from '@/lib/authz';
import { logActivity } from '@/lib/log';
import { SETTINGS_ID } from '@/lib/doc-settings';
import type { ActionResult } from '@/components/action-button';

/**
 * Images arrive as data URLs the browser already re-encoded to PNG at a bounded
 * size (see settings-manager). The cap here is the backstop for anything that
 * did not come through that form: @react-pdf embeds the bytes into every page
 * of the document, so a 5 MB crest would be a 5 MB × 300-student print job.
 */
const MAX_IMAGE_CHARS = 700_000; // ≈ 500 KB of PNG

const image = z
  .string()
  .trim()
  .max(MAX_IMAGE_CHARS, 'รูปมีขนาดใหญ่เกินไป — ใช้ไฟล์ที่เล็กกว่านี้')
  .refine((v) => v === '' || /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v), {
    message: 'ไฟล์รูปไม่ถูกต้อง — รองรับ PNG หรือ JPG',
  })
  .default('');

const SettingsInput = z.object({
  schoolName: z.string().trim().min(1, 'กรอกชื่อโรงเรียน').max(120),
  documentTitle: z.string().trim().min(1, 'กรอกชื่อเอกสาร').max(120),
  documentSubtitle: z.string().trim().max(200).default(''),
  logo: image,
  directorName: z.string().trim().max(120).default(''),
  directorTitle: z.string().trim().min(1, 'กรอกตำแหน่งผู้ลงนาม').max(120),
  directorSignature: image,
  registrarName: z.string().trim().max(120).default(''),
  registrarTitle: z.string().trim().min(1, 'กรอกตำแหน่งผู้ลงนาม').max(120),
  registrarSignature: image,
});

export type SettingsForm = z.input<typeof SettingsInput>;

/**
 * Save ตั้งค่าเอกสาร. One row, always id 1 — an upsert rather than an
 * insert-or-update pair so two admins saving at once cannot create a second.
 */
export async function saveDocumentSettings(form: SettingsForm): Promise<ActionResult> {
  const user = await requireRole('admin');
  const parsed = SettingsInput.safeParse(form);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง' };
  const f = parsed.data;

  const blank = (v: string) => (v === '' ? null : v);
  const values = {
    schoolName: f.schoolName,
    documentTitle: f.documentTitle,
    documentSubtitle: blank(f.documentSubtitle),
    logo: blank(f.logo),
    directorName: blank(f.directorName),
    directorTitle: f.directorTitle,
    directorSignature: blank(f.directorSignature),
    registrarName: blank(f.registrarName),
    registrarTitle: f.registrarTitle,
    registrarSignature: blank(f.registrarSignature),
    updatedBy: user.name,
    updatedAt: new Date(),
  };

  await db
    .insert(documentSettings)
    .values({ id: SETTINGS_ID, ...values })
    .onConflictDoUpdate({ target: documentSettings.id, set: values });

  // The images are the payload and would drown the log; record what changed.
  await logActivity(user, 'update_document_settings', 'transcript', {
    logo: Boolean(values.logo),
    directorSignature: Boolean(values.directorSignature),
    registrarSignature: Boolean(values.registrarSignature),
  });
  revalidatePath('/admin/settings');
  revalidatePath('/admin/transcript');
  return { ok: true, message: 'บันทึกตั้งค่าเอกสารแล้ว' };
}
