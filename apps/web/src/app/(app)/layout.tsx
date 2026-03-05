import { Toaster } from 'sonner';
import { AuthBootstrap } from '@/features/auth/components/AuthBootstrap';
import { AppBar } from '@/components/AppBar';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { RouteProgress } from '@/components/RouteProgress';
import { SocketProvider } from '@/features/chat/context/SocketProvider';
import { ChatPanelProvider } from '@/features/chat/context/ChatPanelContext';
import { ChatPanel } from '@/features/chat/components/ChatPanel';
import { LeagueIdSync } from '@/features/chat/components/LeagueIdSync';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthBootstrap>
      <SocketProvider>
        <ChatPanelProvider>
          <RouteProgress />
          <LeagueIdSync />
          <ConnectionBanner />
          <AppBar />
          <main className="pt-14">{children}</main>
          <ChatPanel />
          <Toaster position="bottom-right" richColors toastOptions={{ className: 'glass-strong' }} />
        </ChatPanelProvider>
      </SocketProvider>
    </AuthBootstrap>
  );
}
