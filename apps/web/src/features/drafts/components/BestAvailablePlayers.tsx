'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Check, Search } from 'lucide-react';
import type { Player } from '@/lib/api';
import { draftApi } from '@/lib/api';

const BASE_POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;
const PAGE_SIZE = 50;

interface BestAvailablePlayersProps {
  draftId: string;
  draftedPlayerIds: Set<string>;
  queuedPlayerIds: Set<string>;
  onAdd: (playerId: string) => void;
  onDraft?: (playerId: string) => void;
  isMyTurn?: boolean;
  isPicking?: boolean;
  actionLabel?: string;
  accessToken: string;
  includeRookiePicks?: boolean;
}

export function BestAvailablePlayers({
  draftId,
  draftedPlayerIds,
  queuedPlayerIds,
  onAdd,
  onDraft,
  isMyTurn = false,
  isPicking = false,
  actionLabel = 'Draft',
  accessToken,
  includeRookiePicks = false,
}: BestAvailablePlayersProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [position, setPosition] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fetchGenRef = useRef(0);

  const positions = includeRookiePicks
    ? [...BASE_POSITIONS, 'PICK'] as const
    : BASE_POSITIONS;

  const fetchPlayers = useCallback(async (reset: boolean) => {
    const gen = ++fetchGenRef.current;
    const currentOffset = reset ? 0 : offset;
    setIsLoading(true);
    try {
      const result = await draftApi.getAvailablePlayers(draftId, accessToken, {
        position: position === 'ALL' ? undefined : position,
        q: searchQuery.trim() || undefined,
        limit: PAGE_SIZE,
        offset: currentOffset,
      });
      if (gen !== fetchGenRef.current) return; // Discard stale response
      if (reset) {
        setPlayers(result.players);
        setOffset(result.players.length);
      } else {
        setPlayers((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const newPlayers = result.players.filter((p) => !existingIds.has(p.id));
          return [...prev, ...newPlayers];
        });
        setOffset(currentOffset + result.players.length);
      }
      setHasMore(result.players.length === PAGE_SIZE);
    } catch {
      // Silently ignore
    } finally {
      if (gen === fetchGenRef.current) setIsLoading(false);
    }
  }, [draftId, accessToken, position, searchQuery, offset]);

  // Reset and fetch when filters change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setOffset(0);
      setHasMore(true);
      fetchPlayers(true);
    }, searchQuery ? 300 : 0);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [draftId, accessToken, position, searchQuery]);

  // Refresh when draftedPlayerIds changes (new pick made)
  const draftedCountRef = useRef(draftedPlayerIds.size);
  useEffect(() => {
    if (draftedPlayerIds.size !== draftedCountRef.current) {
      draftedCountRef.current = draftedPlayerIds.size;
      fetchPlayers(true);
    }
  }, [draftedPlayerIds.size]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || isLoading || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) {
      fetchPlayers(false);
    }
  };

  const isRookiePick = (id: string) => id.startsWith('rpick:');

  return (
    <div className="flex h-full flex-col">
      {/* Search input */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-disabled" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by name..."
            className="w-full rounded-lg border border-input py-1.5 pl-7 pr-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Position filter pills */}
      <div className="flex gap-1 px-3 pb-2 flex-wrap">
        {positions.map((pos) => (
          <button
            key={pos}
            onClick={() => setPosition(pos)}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
              position === pos
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted-hover'
            }`}
          >
            {pos}
          </button>
        ))}
      </div>

      {/* Player list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto divide-y divide-border scrollbar-sleek"
      >
        {players.length === 0 && !isLoading && (
          <div className="px-4 py-6 text-center text-sm text-disabled">
            No players found
          </div>
        )}
        {players.map((player, index) => {
          const isQueued = queuedPlayerIds.has(player.id);
          const isRpick = isRookiePick(player.id);
          return (
            <div
              key={player.id}
              className={`flex items-center gap-2 px-3 py-1.5 hover:bg-accent transition-colors ${isRpick ? 'bg-warning/30' : ''}`}
            >
              {isRpick ? (
                <span className="w-6 text-right text-xs font-bold text-warning-foreground">
                  R{player.team?.replace('R', '')}
                </span>
              ) : (
                <span className="w-6 text-right text-xs font-medium text-disabled">
                  {player.search_rank ?? index + 1}
                </span>
              )}
              <div className="flex-1 min-w-0">
                {isRpick ? (
                  <>
                    <div className="truncate text-sm font-medium text-warning-foreground">
                      {player.last_name}
                    </div>
                    <div className="text-xs text-warning-foreground/70">
                      Next Available Pick
                    </div>
                  </>
                ) : (
                  <>
                    <div className="truncate text-sm font-medium text-foreground">
                      {player.full_name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {player.position}{player.team ? ` - ${player.team}` : ''}
                    </div>
                  </>
                )}
              </div>
              {onDraft && (
                <button
                  onClick={() => onDraft(player.id)}
                  disabled={!isMyTurn || isPicking}
                  className={`rounded px-1.5 py-0.5 text-xs font-medium transition-colors ${
                    isMyTurn && !isPicking
                      ? 'bg-primary text-primary-foreground hover:bg-primary-hover glow-primary'
                      : 'bg-muted-hover text-disabled cursor-not-allowed'
                  }`}
                  title={!isMyTurn ? 'Not your turn' : `${actionLabel} ${isRpick ? 'pick' : 'player'}`}
                >
                  {actionLabel}
                </button>
              )}
              <button
                onClick={() => !isQueued && onAdd(player.id)}
                disabled={isQueued}
                className={`rounded p-1 transition-colors ${
                  isQueued
                    ? 'text-success-foreground'
                    : 'text-disabled hover:bg-primary/10 hover:text-primary'
                }`}
                title={isQueued ? 'Already in queue' : 'Add to queue'}
              >
                {isQueued ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              </button>
            </div>
          );
        })}
        {isLoading && (
          <div className="flex justify-center py-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-input border-t-primary" />
          </div>
        )}
      </div>
    </div>
  );
}
