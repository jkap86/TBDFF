'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown, X, Search } from 'lucide-react';
import type { DraftQueueItem, Player } from '@/lib/api';
import { playerApi } from '@/lib/api';

interface DraftQueueProps {
  queue: DraftQueueItem[];
  draftedPlayerIds: Set<string>;
  onReorder: (playerIds: string[]) => void;
  onRemove: (playerId: string) => void;
  onAdd: (playerId: string) => void;
  accessToken: string;
}

export function DraftQueue({ queue, draftedPlayerIds, onReorder, onRemove, onAdd, accessToken }: DraftQueueProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const queuedPlayerIds = new Set(queue.map((q) => q.player_id));

  // Debounced search
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const result = await playerApi.search(searchQuery.trim(), accessToken, 10);
        // Filter out already queued and already drafted players
        const filtered = result.players.filter(
          (p) => !queuedPlayerIds.has(p.id) && !draftedPlayerIds.has(p.id)
        );
        setSearchResults(filtered);
        setShowDropdown(true);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, accessToken]);

  const handleSelect = (player: Player) => {
    onAdd(player.id);
    setSearchQuery('');
    setSearchResults([]);
    setShowDropdown(false);
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const ids = queue.map((q) => q.player_id);
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    onReorder(ids);
  };

  const handleMoveDown = (index: number) => {
    if (index >= queue.length - 1) return;
    const ids = queue.map((q) => q.player_id);
    [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
    onReorder(ids);
  };

  const availableCount = queue.filter((q) => !draftedPlayerIds.has(q.player_id)).length;

  return (
    <div className="rounded-lg bg-white shadow">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-bold text-gray-900">My Queue</h3>
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
          {availableCount} available
        </span>
      </div>

      {queue.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400">
          No players queued. Add players to prioritize your autopick.
        </div>
      ) : (
        <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto">
          {queue.map((item, index) => {
            const isDrafted = draftedPlayerIds.has(item.player_id);
            return (
              <li
                key={item.player_id}
                className={`flex items-center gap-2 px-3 py-2 ${isDrafted ? 'bg-gray-50 opacity-50' : ''}`}
              >
                <span className="w-5 text-center text-xs font-medium text-gray-400">{index + 1}</span>
                <div className={`flex-1 min-w-0 ${isDrafted ? 'line-through' : ''}`}>
                  <div className="truncate text-sm font-medium text-gray-900">
                    {item.full_name || item.player_id}
                  </div>
                  <div className="text-xs text-gray-500">
                    {item.position}{item.team ? ` - ${item.team}` : ''}
                  </div>
                </div>
                {!isDrafted && (
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:invisible"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleMoveDown(index)}
                      disabled={index >= queue.length - 1}
                      className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:invisible"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <button
                  onClick={() => onRemove(item.player_id)}
                  className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="relative border-t border-gray-200 px-3 py-2" ref={dropdownRef}>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
            onKeyDown={(e) => e.key === 'Escape' && setShowDropdown(false)}
            placeholder="Search players..."
            className="w-full rounded border border-gray-300 py-1.5 pl-7 pr-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {isSearching && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
            </div>
          )}
        </div>

        {showDropdown && searchResults.length > 0 && (
          <ul className="absolute left-0 right-0 z-10 mx-3 mt-1 max-h-48 overflow-y-auto rounded border border-gray-200 bg-white shadow-lg">
            {searchResults.map((player) => (
              <li key={player.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(player)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-blue-50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium text-gray-900">{player.full_name}</div>
                    <div className="text-xs text-gray-500">
                      {player.position}{player.team ? ` - ${player.team}` : ''}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {showDropdown && searchQuery.trim().length >= 2 && !isSearching && searchResults.length === 0 && (
          <div className="absolute left-0 right-0 z-10 mx-3 mt-1 rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-400 shadow-lg">
            No players found
          </div>
        )}
      </div>
    </div>
  );
}
