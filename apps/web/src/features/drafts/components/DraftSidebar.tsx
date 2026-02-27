'use client';

import type { DraftQueueItem } from '@/lib/api';
import { BestAvailablePlayers } from './BestAvailablePlayers';
import { DraftQueue } from './DraftQueue';

interface DraftSidebarProps {
  draftId: string;
  draftedPlayerIds: Set<string>;
  queue: DraftQueueItem[];
  sidebarTab: 'queue' | 'players';
  onTabChange: (tab: 'queue' | 'players') => void;
  onAdd: (playerId: string) => void;
  onDraft?: (playerId: string) => void;
  isMyTurn?: boolean;
  isPicking?: boolean;
  actionLabel?: string;
  onReorder: (playerIds: string[]) => void;
  onRemove: (playerId: string) => void;
  onUpdateMaxBid: (playerId: string, maxBid: number | null) => void;
  accessToken: string;
  isAuction: boolean;
  budget: number;
  height?: string;
}

export function DraftSidebar({
  draftId,
  draftedPlayerIds,
  queue,
  sidebarTab,
  onTabChange,
  onAdd,
  onDraft,
  isMyTurn,
  isPicking,
  actionLabel,
  onReorder,
  onRemove,
  onUpdateMaxBid,
  accessToken,
  isAuction,
  budget,
  height = 'calc(100vh - 200px)',
}: DraftSidebarProps) {
  return (
    <div className="rounded-lg bg-white dark:bg-gray-800 shadow flex flex-col" style={{ height }}>
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => onTabChange('players')}
          className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${
            sidebarTab === 'players'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Players
        </button>
        <button
          onClick={() => onTabChange('queue')}
          className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${
            sidebarTab === 'queue'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          My Queue
        </button>
      </div>
      <div className="flex-1 min-h-0">
        {sidebarTab === 'players' ? (
          <BestAvailablePlayers
            draftId={draftId}
            draftedPlayerIds={draftedPlayerIds}
            queuedPlayerIds={new Set(queue.map((q) => q.player_id))}
            onAdd={onAdd}
            onDraft={onDraft}
            isMyTurn={isMyTurn}
            isPicking={isPicking}
            actionLabel={actionLabel}
            accessToken={accessToken}
          />
        ) : (
          <DraftQueue
            queue={queue}
            draftedPlayerIds={draftedPlayerIds}
            onReorder={onReorder}
            onRemove={onRemove}
            onUpdateMaxBid={onUpdateMaxBid}
            isAuction={isAuction}
            budget={budget}
          />
        )}
      </div>
    </div>
  );
}
