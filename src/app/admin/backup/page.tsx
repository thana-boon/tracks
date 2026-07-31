import { listBackups } from '@/lib/backup';
import { BackupManager, type BackupRow } from './backup-manager';

export const metadata = { title: 'สำรองข้อมูล' };

export default async function BackupPage() {
  const files = await listBackups();
  const backups: BackupRow[] = files.map((f) => ({
    name: f.name,
    size: f.size,
    createdAt: f.createdAt.toISOString(),
  }));
  return <BackupManager backups={backups} />;
}
