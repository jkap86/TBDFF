import { Toaster } from 'sonner';
import { AuthBootstrap } from '@/features/auth/components/AuthBootstrap';
import { AppBar } from '@/components/AppBar';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { RouteProgress } from '@/components/RouteProgress';
import { SocketProvider } from '@/features/chat/context/SocketProvider';
import { ChatPanelProvider } from '@/features/chat/context/ChatPanelContext';
import { ChatPanel } from '@/features/chat/components/ChatPanel';
import { ActionsPanelProvider } from '@/features/actions/context/ActionsPanelContext';
import { ActionsPanel } from '@/features/actions/components/ActionsPanel';
import { LeagueIdSync } from '@/components/LeagueIdSync';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthBootstrap>
      <SocketProvider>
        <ChatPanelProvider>
          <ActionsPanelProvider>
            <RouteProgress />
            <LeagueIdSync />
            <ConnectionBanner />
            <AppBar />
            <main className="pt-14">{children}</main>
            <ChatPanel />
            <ActionsPanel />
            <Toaster position="bottom-right" richColors toastOptions={{ className: 'glass-strong' }} />
          </ActionsPanelProvider>
        </ChatPanelProvider>
      </SocketProvider>
    </AuthBootstrap>
  );
}
