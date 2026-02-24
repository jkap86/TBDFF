'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Check, Search } from 'lucide-react';
import type { Player } from '@/lib/api';
import { draftApi } from '@/lib/api';

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const;
const PAGE_SIZE = 50;

interface BestAvailablePlayersProps {
  draftId: string;
  draftedPlayerIds: Set<string>;
  queuedPlayerIds: Set<string>;
  onAdd: (playerId: string) => void;
  accessToken: string;
}

export function BestAvailablePlayers({
  draftId,
  draftedPlayerIds,
  queuedPlayerIds,
  onAdd,
  accessToken,
}: BestAvailablePlayersProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [position, setPosition] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchPlayers = useCallback(async (reset: boolean) => {
    const currentOffset = reset ? 0 : offset;
    setIsLoading(true);
    try {
      const result = await draftApi.getAvailablePlayers(draftId, accessToken, {
        position: position === 'ALL' ? undefined : position,
        q: searchQuery.trim() || undefined,
        limit: PAGE_SIZE,
        offset: currentOffset,
      });
      if (reset) {
        setPlayers(result.players);
        setOffset(result.players.length);
      } else {
        setPlayers((prev) => [...prev, ...result.players]);
        setOffset(currentOffset + result.players.length);
      }
      setHasMore(result.players.length === PAGE_SIZE);
    } catch {
      // Silently ignore
    } finally {
      setIsLoading(false);
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

  return (
    <div className="flex h-full flex-col">
      {/* Search input */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by name..."
            className="w-full rounded border border-gray-300 py-1.5 pl-7 pr-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Position filter pills */}
      <div className="flex gap-1 px-3 pb-2 flex-wrap">
        {POSITIONS.map((pos) => (
          <button
            key={pos}
            onClick={() => setPosition(pos)}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
              position === pos
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
        className="flex-1 overflow-y-auto divide-y divide-gray-100"
      >
        {players.length === 0 && !isLoading && (
          <div className="px-4 py-6 text-center text-sm text-gray-400">
            No players found
          </div>
        )}
        {players.map((player, index) => {
          const isQueued = queuedPlayerIds.has(player.id);
          return (
            <div
              key={player.id}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50"
            >
              <span className="w-6 text-right text-xs font-medium text-gray-400">
                {player.search_rank ?? index + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-medium text-gray-900">
                  {player.full_name}
                </div>
                <div className="text-xs text-gray-500">
                  {player.position}{player.team ? ` - ${player.team}` : ''}
                </div>
              </div>
              <button
                onClick={() => !isQueued && onAdd(player.id)}
                disabled={isQueued}
                className={`rounded p-1 ${
                  isQueued
                    ? 'text-green-500'
                    : 'text-gray-400 hover:bg-blue-50 hover:text-blue-600'
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
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
          </div>
        )}
      </div>
    </div>
  );
}
