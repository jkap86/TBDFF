'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { LeagueMember, Player, Roster, ProposeTradeRequest, FutureDraftPick } from '@/lib/api';

interface TradeComposerProps {
  isOpen: boolean;
  onClose: () => void;
  members: LeagueMember[];
  rosters: Roster[];
  currentUserId: string;
  playerMap: Record<string, Player>;
  futurePicks: FutureDraftPick[];
  picksError?: string | null;
  onSubmit: (data: ProposeTradeRequest) => Promise<unknown>;
}

function playerLabel(pid: string, playerMap: Record<string, Player>): string {
  const p = playerMap[pid];
  if (!p) return pid;
  return `${p.full_name} (${p.position ?? 'N/A'})`;
}

function pickLabel(pick: FutureDraftPick, currentUserId: string): string {
  let base = `${pick.season} Round ${pick.round}`;
  if (pick.pick_number) {
    base += ` Pick ${pick.pick_number}`;
  }
  if (pick.original_owner_id !== pick.current_owner_id) {
    const ownerName = pick.original_owner_username ?? 'Unknown';
    return `${base} (${ownerName}'s pick)`;
  }
  return base;
}

function PicksSection({ picks, selectedPicks, onToggle, currentUserId, picksError }: {
  picks: FutureDraftPick[];
  selectedPicks: string[];
  onToggle: (id: string) => void;
  currentUserId: string;
  picksError?: string | null;
}) {
  return (
    <>
      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-3 mb-1">Draft Picks</h4>
      <div className="max-h-32 overflow-y-auto space-y-1 border border-gray-200 dark:border-gray-600 rounded p-2">
        {picksError ? (
          <p className="text-xs text-red-400">{picksError}</p>
        ) : picks.length === 0 ? (
          <p className="text-xs text-gray-400">No draft picks available</p>
        ) : (
          picks.map((pick) => (
            <label key={pick.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-1 rounded">
              <input
                type="checkbox"
                checked={selectedPicks.includes(pick.id)}
                onChange={() => onToggle(pick.id)}
                className="rounded"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">{pickLabel(pick, currentUserId)}</span>
            </label>
          ))
        )}
      </div>
    </>
  );
}

export function TradeComposer({ isOpen, onClose, members, rosters, currentUserId, playerMap, futurePicks, picksError, onSubmit }: TradeComposerProps) {
  const [selectedPartner, setSelectedPartner] = useState('');
  const [message, setMessage] = useState('');
  const [myPlayers, setMyPlayers] = useState<string[]>([]);
  const [theirPlayers, setTheirPlayers] = useState<string[]>([]);
  const [myPicks, setMyPicks] = useState<string[]>([]);
  const [theirPicks, setTheirPicks] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otherMembers = members.filter((m) => m.user_id !== currentUserId);
  const myRoster = rosters.find((r) => r.owner_id === currentUserId);
  const partnerRoster = rosters.find((r) => r.owner_id === selectedPartner);
  const myFuturePicks = futurePicks.filter((p) => p.current_owner_id === currentUserId);
  const theirFuturePicks = futurePicks.filter((p) => p.current_owner_id === selectedPartner);

  const hasMyItems = myPlayers.length > 0 || myPicks.length > 0;
  const hasTheirItems = theirPlayers.length > 0 || theirPicks.length > 0;

  const handleSubmit = async () => {
    if (!selectedPartner || !myRoster || !partnerRoster) return;
    if (!hasMyItems || !hasTheirItems) return;

    const items: ProposeTradeRequest['items'] = [
      ...myPlayers.map((pid) => ({
        side: 'proposer' as const,
        item_type: 'player' as const,
        player_id: pid,
        roster_id: myRoster.roster_id,
      })),
      ...theirPlayers.map((pid) => ({
        side: 'receiver' as const,
        item_type: 'player' as const,
        player_id: pid,
        roster_id: partnerRoster.roster_id,
      })),
      ...myPicks.map((pickId) => ({
        side: 'proposer' as const,
        item_type: 'draft_pick' as const,
        draft_pick_id: pickId,
        roster_id: myRoster.roster_id,
      })),
      ...theirPicks.map((pickId) => ({
        side: 'receiver' as const,
        item_type: 'draft_pick' as const,
        draft_pick_id: pickId,
        roster_id: partnerRoster.roster_id,
      })),
    ];

    try {
      setIsSubmitting(true);
      setError(null);
      await onSubmit({
        proposed_to: selectedPartner,
        message: message || undefined,
        items,
      });
      onClose();
      setSelectedPartner('');
      setMessage('');
      setMyPlayers([]);
      setTheirPlayers([]);
      setMyPicks([]);
      setTheirPicks([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to propose trade');
    } finally {
      setIsSubmitting(false);
    }
  };

  const togglePlayer = (playerId: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.includes(playerId) ? list.filter((p) => p !== playerId) : [...list, playerId]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Propose Trade</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded bg-red-50 dark:bg-red-900/30 p-3 text-sm text-red-600 dark:text-red-400">{error}</div>
        )}

        {/* Trade Partner Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Trade Partner</label>
          <select
            value={selectedPartner}
            onChange={(e) => {
              setSelectedPartner(e.target.value);
              setTheirPlayers([]);
              setTheirPicks([]);
            }}
            className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white"
          >
            <option value="">Select a team...</option>
            {otherMembers.map((m) => (
              <option key={m.user_id} value={m.user_id}>{m.username}</option>
            ))}
          </select>
        </div>

        {/* Two Column Player Selection */}
        {selectedPartner && myRoster && partnerRoster && (
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">You Give</h3>
              {myRoster.players.length === 0 ? (
                <>
                  <PicksSection
                    picks={myFuturePicks}
                    selectedPicks={myPicks}
                    onToggle={(id) => togglePlayer(id, myPicks, setMyPicks)}
                    currentUserId={currentUserId}
                    picksError={picksError}
                  />
                  <div className="max-h-48 overflow-y-auto space-y-1 border border-gray-200 dark:border-gray-600 rounded p-2 mt-3">
                    <p className="text-xs text-gray-400">No players on roster</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="max-h-48 overflow-y-auto space-y-1 border border-gray-200 dark:border-gray-600 rounded p-2">
                    {myRoster.players.map((pid) => (
                      <label key={pid} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={myPlayers.includes(pid)}
                          onChange={() => togglePlayer(pid, myPlayers, setMyPlayers)}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{playerLabel(pid, playerMap)}</span>
                      </label>
                    ))}
                  </div>
                  <PicksSection
                    picks={myFuturePicks}
                    selectedPicks={myPicks}
                    onToggle={(id) => togglePlayer(id, myPicks, setMyPicks)}
                    currentUserId={currentUserId}
                    picksError={picksError}
                  />
                </>
              )}
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">You Receive</h3>
              {partnerRoster.players.length === 0 ? (
                <>
                  <PicksSection
                    picks={theirFuturePicks}
                    selectedPicks={theirPicks}
                    onToggle={(id) => togglePlayer(id, theirPicks, setTheirPicks)}
                    currentUserId={currentUserId}
                    picksError={picksError}
                  />
                  <div className="max-h-48 overflow-y-auto space-y-1 border border-gray-200 dark:border-gray-600 rounded p-2 mt-3">
                    <p className="text-xs text-gray-400">No players on roster</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="max-h-48 overflow-y-auto space-y-1 border border-gray-200 dark:border-gray-600 rounded p-2">
                    {partnerRoster.players.map((pid) => (
                      <label key={pid} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 p-1 rounded">
                        <input
                          type="checkbox"
                          checked={theirPlayers.includes(pid)}
                          onChange={() => togglePlayer(pid, theirPlayers, setTheirPlayers)}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{playerLabel(pid, playerMap)}</span>
                      </label>
                    ))}
                  </div>
                  <PicksSection
                    picks={theirFuturePicks}
                    selectedPicks={theirPicks}
                    onToggle={(id) => togglePlayer(id, theirPicks, setTheirPicks)}
                    currentUserId={currentUserId}
                    picksError={picksError}
                  />
                </>
              )}
            </div>
          </div>
        )}

        {/* Message */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message (optional)</label>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            placeholder="Add a note to your trade proposal..."
            className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white"
          />
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedPartner || !hasMyItems || !hasTheirItems}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSubmitting ? 'Sending...' : 'Propose Trade'}
          </button>
        </div>
      </div>
    </div>
  );
}
