import { RoleShell } from '@/components/role-shell';

export default function ResultsLayout({ children }: { children: React.ReactNode }) {
  return <RoleShell allow={['admin', 'teacher']}>{children}</RoleShell>;
}
