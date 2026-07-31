import { redirect } from 'next/navigation';
import { currentUser, dashboardPath } from '@/lib/authz';

export default async function Home() {
  const user = await currentUser();
  redirect(user ? dashboardPath(user.role) : '/login');
}
