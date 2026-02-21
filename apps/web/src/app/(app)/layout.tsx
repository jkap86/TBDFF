import { AuthBootstrap } from '@/features/auth/components/AuthBootstrap';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AuthBootstrap>{children}</AuthBootstrap>;
}
