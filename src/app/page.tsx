import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { dashboardPath } from '@/lib/authz';

export default async function Home() {
  const user = await getSession();
  redirect(user ? dashboardPath(user.role) : '/login');
}
