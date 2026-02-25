import { AuthBootstrap } from '@/features/auth/components/AuthBootstrap';
import { AppBar } from '@/components/AppBar';
import { SocketProvider } from '@/features/chat/context/SocketProvider';
import { DMPanelProvider } from '@/features/chat/context/DMPanelContext';
import { DMPanel } from '@/features/chat/components/DMPanel';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthBootstrap>
      <SocketProvider>
        <DMPanelProvider>
          <AppBar />
          <main>{children}</main>
          <DMPanel />
        </DMPanelProvider>
      </SocketProvider>
    </AuthBootstrap>
  );
}
