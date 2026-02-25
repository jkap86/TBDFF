import { AuthBootstrap } from '@/features/auth/components/AuthBootstrap';
import { AppBar } from '@/components/AppBar';
import { SocketProvider } from '@/features/chat/context/SocketProvider';
import { DMPanel } from '@/features/chat/components/DMPanel';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthBootstrap>
      <SocketProvider>
        <AppBar />
        <main>{children}</main>
        <DMPanel />
      </SocketProvider>
    </AuthBootstrap>
  );
}
