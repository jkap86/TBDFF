'use client';

import type { DraftPick, DraftQueueItem, Roster, LeagueMember } from '@/lib/api';
import { BestAvailablePlayers } from './BestAvailablePlayers';
import { DraftQueue } from './DraftQueue';
import { ScheduleTab } from './ScheduleTab';

interface DraftSidebarProps {
  draftId: string;
  leagueId: string;
  draftedPlayerIds: Set<string>;
  activeLotPlayerIds?: Set<string>;
  queue: DraftQueueItem[];
  sidebarTab: 'queue' | 'players' | 'schedule';
  onTabChange: (tab: 'queue' | 'players' | 'schedule') => void;
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
  teams: number;
  height?: string;
  includeRookiePicks?: boolean;
  myRosterId?: number;
  picks: DraftPick[];
  rosters: Roster[];
  members: LeagueMember[];
}

export function DraftSidebar({
  draftId,
  leagueId,
  draftedPlayerIds,
  activeLotPlayerIds,
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
  teams,
  height = 'calc(100vh - 200px)',
  includeRookiePicks,
  myRosterId,
  picks,
  rosters,
  members,
}: DraftSidebarProps) {
  return (
    <div className="rounded-lg border border-border bg-card shadow flex flex-col" style={{ height }}>
      <div className="flex border-b border-border">
        <button
          onClick={() => onTabChange('players')}
          className={`flex-1 px-3 py-2.5 text-sm font-heading font-bold uppercase tracking-wide transition-colors ${
            sidebarTab === 'players'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-accent-foreground hover:bg-accent/50'
          }`}
        >
          Players
        </button>
        <button
          onClick={() => onTabChange('queue')}
          className={`flex-1 px-3 py-2.5 text-sm font-heading font-bold uppercase tracking-wide transition-colors ${
            sidebarTab === 'queue'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-accent-foreground hover:bg-accent/50'
          }`}
        >
          My Queue
        </button>
        <button
          onClick={() => onTabChange('schedule')}
          className={`flex-1 px-3 py-2.5 text-sm font-heading font-bold uppercase tracking-wide transition-colors ${
            sidebarTab === 'schedule'
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-accent-foreground hover:bg-accent/50'
          }`}
        >
          Schedule
        </button>
      </div>
      <div className="flex-1 min-h-0">
        {sidebarTab === 'players' ? (
          <BestAvailablePlayers
            draftId={draftId}
            draftedPlayerIds={draftedPlayerIds}
            activeLotPlayerIds={activeLotPlayerIds}
            queuedPlayerIds={new Set(queue.map((q) => q.player_id))}
            onAdd={onAdd}
            onDraft={onDraft}
            isMyTurn={isMyTurn}
            isPicking={isPicking}
            actionLabel={actionLabel}
            accessToken={accessToken}
            includeRookiePicks={includeRookiePicks}
          />
        ) : sidebarTab === 'queue' ? (
          <DraftQueue
            queue={queue}
            draftedPlayerIds={draftedPlayerIds}
            onReorder={onReorder}
            onRemove={onRemove}
            onUpdateMaxBid={onUpdateMaxBid}
            isAuction={isAuction}
            budget={budget}
            teams={teams}
          />
        ) : (
          <ScheduleTab
            leagueId={leagueId}
            myRosterId={myRosterId}
            picks={picks}
            rosters={rosters}
            members={members}
            accessToken={accessToken}
          />
        )}
      </div>
    </div>
  );
}
