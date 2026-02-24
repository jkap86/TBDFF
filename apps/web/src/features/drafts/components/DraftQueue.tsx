'use client';

import { useState } from 'react';
import { ChevronUp, ChevronDown, X, Plus } from 'lucide-react';
import type { DraftQueueItem } from '@/lib/api';

interface DraftQueueProps {
  queue: DraftQueueItem[];
  draftedPlayerIds: Set<string>;
  onReorder: (playerIds: string[]) => void;
  onRemove: (playerId: string) => void;
  onAdd: (playerId: string) => void;
}

export function DraftQueue({ queue, draftedPlayerIds, onReorder, onRemove, onAdd }: DraftQueueProps) {
  const [addPlayerId, setAddPlayerId] = useState('');

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

  const handleAdd = () => {
    const id = addPlayerId.trim();
    if (!id) return;
    onAdd(id);
    setAddPlayerId('');
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

      <div className="border-t border-gray-200 px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={addPlayerId}
            onChange={(e) => setAddPlayerId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Player ID"
            className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleAdd}
            disabled={!addPlayerId.trim()}
            className="rounded bg-blue-600 p-1.5 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
