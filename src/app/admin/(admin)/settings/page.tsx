import { requireRole } from '@/lib/authz';
import { docSettings } from '@/lib/doc-settings';
import { thaiRelativeTime } from '@/lib/utils';
import { SettingsManager } from './settings-manager';

export const metadata = { title: 'ตั้งค่าเอกสาร' };

export default async function DocumentSettingsPage() {
  await requireRole('admin');
  const s = await docSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ตั้งค่าเอกสาร</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ตราโรงเรียน ชื่อผู้ลงนาม และลายเซ็นที่พิมพ์ลงบนทรานสคริปต์ — แก้ที่นี่ที่เดียว
          ทุกใบที่พิมพ์หลังจากนี้จะใช้ค่าใหม่
          {s.updatedAt ? (
            <>
              {' '}· แก้ไขล่าสุด {thaiRelativeTime(s.updatedAt)}
              {s.updatedBy ? ` โดย ${s.updatedBy}` : ''}
            </>
          ) : null}
        </p>
      </div>
      <SettingsManager
        initial={{
          schoolName: s.schoolName,
          documentTitle: s.documentTitle,
          documentSubtitle: s.documentSubtitle ?? '',
          logo: s.logo ?? '',
          directorName: s.directorName ?? '',
          directorTitle: s.directorTitle,
          directorSignature: s.directorSignature ?? '',
          registrarName: s.registrarName ?? '',
          registrarTitle: s.registrarTitle,
          registrarSignature: s.registrarSignature ?? '',
        }}
      />
    </div>
  );
}
