'use client';

import { useSocket } from '@/features/chat/context/SocketProvider';
import { useAuth } from '@/features/auth/hooks/useAuth';

export function ConnectionBanner() {
  const { connectionStatus } = useSocket();
  const { isAuthenticated } = useAuth();

  // Only show when authenticated and disconnected
  if (!isAuthenticated || connectionStatus === 'connected') return null;

  return (
    <div className="bg-yellow-500 text-yellow-900 text-center text-sm py-1.5 px-4">
      {connectionStatus === 'connecting'
        ? 'Connecting to real-time updates...'
        : 'Real-time updates disconnected. Reconnecting...'}
    </div>
  );
}
