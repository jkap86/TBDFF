import { AuthBootstrap } from '@/features/auth/components/AuthBootstrap';
import { AppBar } from '@/components/AppBar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthBootstrap>
      <AppBar />
      <main>{children}</main>
    </AuthBootstrap>
  );
}
