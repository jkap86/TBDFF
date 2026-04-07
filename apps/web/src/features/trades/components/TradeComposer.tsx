'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { LeagueMember, Player, Roster, ProposeTradeRequest, CounterTradeRequest, FutureDraftPick } from '@/lib/api';

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
  mode?: 'propose' | 'counter';
  counterTradeId?: string;
  fixedPartner?: { userId: string; username: string };
  onSubmitCounter?: (tradeId: string, data: CounterTradeRequest) => Promise<unknown>;
}

function rosterName(roster: Roster, members: LeagueMember[]): string {
  if (roster.owner_id) {
    const member = members.find((m) => m.user_id === roster.owner_id);
    if (member) return member.username;
  }
  return `Team ${roster.roster_id}`;
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
      <h4 className="text-xs font-medium text-muted-foreground mt-3 mb-1">Draft Picks</h4>
      <div className="max-h-32 overflow-y-auto space-y-1 border border-border rounded p-2">
        {picksError ? (
          <p className="text-xs text-destructive-foreground">{picksError}</p>
        ) : picks.length === 0 ? (
          <p className="text-xs text-disabled">No draft picks available</p>
        ) : (
          picks.map((pick) => (
            <label key={pick.id} className="flex items-center gap-2 cursor-pointer hover:bg-accent p-1 rounded">
              <input
                type="checkbox"
                checked={selectedPicks.includes(pick.id)}
                onChange={() => onToggle(pick.id)}
                className="rounded"
              />
              <span className="text-sm text-accent-foreground">{pickLabel(pick, currentUserId)}</span>
            </label>
          ))
        )}
      </div>
    </>
  );
}

function FaabSection({ label, value, max, onChange }: {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <>
      <h4 className="text-xs font-medium text-muted-foreground mt-3 mb-1">{label} (Available: ${max})</h4>
      <input
        type="number"
        min={0}
        max={max}
        value={value || ''}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        placeholder="0"
        className="w-full rounded border border-input bg-card px-2 py-1 text-sm text-foreground"
      />
    </>
  );
}

export function TradeComposer({
  isOpen, onClose, members, rosters, currentUserId, playerMap, futurePicks, picksError, onSubmit,
  mode = 'propose', counterTradeId, fixedPartner, onSubmitCounter,
}: TradeComposerProps) {
  const [selectedPartner, setSelectedPartner] = useState('');
  const [message, setMessage] = useState('');
  const [myPlayers, setMyPlayers] = useState<string[]>([]);
  const [theirPlayers, setTheirPlayers] = useState<string[]>([]);
  const [myPicks, setMyPicks] = useState<string[]>([]);
  const [theirPicks, setTheirPicks] = useState<string[]>([]);
  const [myFaab, setMyFaab] = useState(0);
  const [theirFaab, setTheirFaab] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCounter = mode === 'counter';

  // Reset all form state when modal closes; prefill partner when reopening in counter mode
  useEffect(() => {
    if (!isOpen) {
      resetForm();
      return;
    }
    if (isCounter && fixedPartner) {
      setSelectedPartner(fixedPartner.userId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const myRoster = rosters.find((r) => r.owner_id === currentUserId);
  const otherRosters = rosters.filter((r) => r.owner_id !== currentUserId);
  const partnerRoster = rosters.find((r) => r.owner_id === selectedPartner);
  const myFuturePicks = futurePicks.filter((p) => p.current_owner_id === currentUserId);
  const theirFuturePicks = futurePicks.filter((p) => p.current_owner_id === selectedPartner);

  const hasMyItems = myPlayers.length > 0 || myPicks.length > 0 || myFaab > 0;
  const hasTheirItems = theirPlayers.length > 0 || theirPicks.length > 0 || theirFaab > 0;

  const resetForm = () => {
    setSelectedPartner('');
    setMessage('');
    setMyPlayers([]);
    setTheirPlayers([]);
    setMyPicks([]);
    setTheirPicks([]);
    setMyFaab(0);
    setTheirFaab(0);
    setError(null);
  };

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
      ...(myFaab > 0 ? [{
        side: 'proposer' as const,
        item_type: 'faab' as const,
        faab_amount: myFaab,
        roster_id: myRoster.roster_id,
      }] : []),
      ...(theirFaab > 0 ? [{
        side: 'receiver' as const,
        item_type: 'faab' as const,
        faab_amount: theirFaab,
        roster_id: partnerRoster.roster_id,
      }] : []),
    ];

    try {
      setIsSubmitting(true);
      setError(null);
      if (isCounter && counterTradeId && onSubmitCounter) {
        await onSubmitCounter(counterTradeId, {
          message: message || undefined,
          items,
        });
      } else {
        await onSubmit({
          proposed_to: selectedPartner,
          message: message || undefined,
          items,
        });
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : isCounter ? 'Failed to send counter-offer' : 'Failed to propose trade');
    } finally {
      setIsSubmitting(false);
    }
  };

  const togglePlayer = (playerId: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.includes(playerId) ? list.filter((p) => p !== playerId) : [...list, playerId]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-lg bg-card glass-strong glow-border p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold gradient-text font-heading">{isCounter ? 'Counter Trade' : 'Propose Trade'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-accent-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded bg-destructive p-3 text-sm text-destructive-foreground">{error}</div>
        )}

        {/* Trade Partner Selection */}
        {isCounter && fixedPartner ? (
          <div className="mb-4">
            <label className="block text-sm font-medium text-accent-foreground mb-1">Trade Partner</label>
            <div className="w-full rounded border border-input bg-muted px-3 py-2 text-foreground">
              {fixedPartner.username}
            </div>
          </div>
        ) : (
          <div className="mb-4">
            <label className="block text-sm font-medium text-accent-foreground mb-1">Trade Partner</label>
            <select
              value={selectedPartner}
              onChange={(e) => {
                setSelectedPartner(e.target.value);
                setTheirPlayers([]);
                setTheirPicks([]);
                setTheirFaab(0);
              }}
              className="w-full rounded border border-input bg-card px-3 py-2 text-foreground"
            >
              <option value="">Select a team...</option>
              {otherRosters.map((r) => (
                <option key={r.roster_id} value={r.owner_id ?? ''} disabled={!r.owner_id}>
                  {rosterName(r, members)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Two Column Player Selection */}
        {selectedPartner && myRoster && partnerRoster && (
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <h3 className="text-sm font-medium text-accent-foreground mb-2">You Give</h3>
              {myRoster.players.length === 0 ? (
                <>
                  <PicksSection
                    picks={myFuturePicks}
                    selectedPicks={myPicks}
                    onToggle={(id) => togglePlayer(id, myPicks, setMyPicks)}
                    currentUserId={currentUserId}
                    picksError={picksError}
                  />
                  <FaabSection label="FAAB" value={myFaab} max={myRoster.waiver_budget} onChange={setMyFaab} />
                  <div className="max-h-48 overflow-y-auto space-y-1 border border-border rounded p-2 mt-3">
                    <p className="text-xs text-disabled">No players on roster</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="max-h-48 overflow-y-auto space-y-1 border border-border rounded p-2">
                    {myRoster.players.map((pid) => (
                      <label key={pid} className="flex items-center gap-2 cursor-pointer hover:bg-accent p-1 rounded">
                        <input
                          type="checkbox"
                          checked={myPlayers.includes(pid)}
                          onChange={() => togglePlayer(pid, myPlayers, setMyPlayers)}
                          className="rounded"
                        />
                        <span className="text-sm text-accent-foreground">{playerLabel(pid, playerMap)}</span>
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
                  <FaabSection label="FAAB" value={myFaab} max={myRoster.waiver_budget} onChange={setMyFaab} />
                </>
              )}
            </div>

            <div>
              <h3 className="text-sm font-medium text-accent-foreground mb-2">You Receive</h3>
              {partnerRoster.players.length === 0 ? (
                <>
                  <PicksSection
                    picks={theirFuturePicks}
                    selectedPicks={theirPicks}
                    onToggle={(id) => togglePlayer(id, theirPicks, setTheirPicks)}
                    currentUserId={currentUserId}
                    picksError={picksError}
                  />
                  <FaabSection label="FAAB" value={theirFaab} max={partnerRoster.waiver_budget} onChange={setTheirFaab} />
                  <div className="max-h-48 overflow-y-auto space-y-1 border border-border rounded p-2 mt-3">
                    <p className="text-xs text-disabled">No players on roster</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="max-h-48 overflow-y-auto space-y-1 border border-border rounded p-2">
                    {partnerRoster.players.map((pid) => (
                      <label key={pid} className="flex items-center gap-2 cursor-pointer hover:bg-accent p-1 rounded">
                        <input
                          type="checkbox"
                          checked={theirPlayers.includes(pid)}
                          onChange={() => togglePlayer(pid, theirPlayers, setTheirPlayers)}
                          className="rounded"
                        />
                        <span className="text-sm text-accent-foreground">{playerLabel(pid, playerMap)}</span>
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
                  <FaabSection label="FAAB" value={theirFaab} max={partnerRoster.waiver_budget} onChange={setTheirFaab} />
                </>
              )}
            </div>
          </div>
        )}

        {/* Message */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-accent-foreground mb-1">Message (optional)</label>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            placeholder={isCounter ? 'Add a note to your counter-offer...' : 'Add a note to your trade proposal...'}
            className="w-full rounded border border-input bg-card px-3 py-2 text-foreground"
          />
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedPartner || !hasMyItems || !hasTheirItems}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
          >
            {isSubmitting ? 'Sending...' : isCounter ? 'Send Counter' : 'Propose Trade'}
          </button>
        </div>
      </div>
    </div>
  );
}
