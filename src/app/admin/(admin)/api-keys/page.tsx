import { requireRole } from '@/lib/authz';
import { listApiKeys } from '@/lib/api-keys';
import { ApiKeysManager } from './api-keys-manager';

export const metadata = { title: 'กุญแจ API' };

export default async function ApiKeysPage() {
  await requireRole('admin');
  return <ApiKeysManager keys={await listApiKeys()} />;
}
