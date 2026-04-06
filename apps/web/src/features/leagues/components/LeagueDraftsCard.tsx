'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Settings, ChevronDown, Shuffle } from 'lucide-react';
import { DerbyPickBoard } from '@/features/drafts/components/DerbyPickBoard';
import { draftTypeLabels, draftStatusColors, draftStatusLabels, playerPoolLabel } from '@/features/leagues/config/league-detail-constants';
import type { Draft, LeagueMember, Roster, League } from '@tbdff/shared';

interface ShuffleDisplay {
  draftId: string;
  lockedCount: number;
  displayRosterIds: number[];
}

interface LeagueDraftsCardProps {
  league: League;
  leagueId: string;
  drafts: Draft[];
  activeDrafts: Draft[];
  completedDrafts: Draft[];
  members: LeagueMember[];
  rosters: Roster[];
  isCommissioner: boolean;
  currentUserId: string | undefined;
  accessToken: string | null;
  shuffleDisplay: ShuffleDisplay | null;
  mutationError: string | null;
  onRandomizeDraftOrder: (draft: Draft) => Promise<void>;
  onStartDerby: (draft: Draft) => Promise<void>;
  initialExpanded?: boolean;
  onEditDraft: (draftId: string) => void;
  onDraftUpdated: (draft: Draft) => void;
}

export function LeagueDraftsCard({
  league,
  leagueId,
  drafts,
  activeDrafts,
  completedDrafts,
  members,
  rosters,
  isCommissioner,
  currentUserId,
  accessToken,
  shuffleDisplay,
  mutationError,
  onRandomizeDraftOrder,
  onStartDerby,
  initialExpanded = false,
  onEditDraft,
  onDraftUpdated,
}: LeagueDraftsCardProps) {
  const [isDraftsExpanded, setIsDraftsExpanded] = useState(initialExpanded);
  const [expandedDraftOrders, setExpandedDraftOrders] = useState<Set<string>>(new Set());
  const [expandedDerbyResults, setExpandedDerbyResults] = useState<Set<string>>(new Set());
  const [reRandomizeDraftId, setReRandomizeDraftId] = useState<string | null>(null);
  const [isStartingDerby, setIsStartingDerby] = useState(false);

  // Auto-expand draft order when shuffle animation starts
  useEffect(() => {
    if (shuffleDisplay) {
      setExpandedDraftOrders((prev) => new Set(prev).add(shuffleDisplay.draftId));
    }
  }, [shuffleDisplay?.draftId]);

  const handleStartDerbyClick = async (draft: Draft) => {
    try {
      setIsStartingDerby(true);
      await onStartDerby(draft);
    } finally {
      setIsStartingDerby(false);
    }
  };

  // Detect "Your Turn" for derby picks
  const isMyTurn = activeDrafts.some((d) => {
    const derby = d.metadata?.derby as any;
    if (derby?.status === 'active' && derby.derby_order && derby.current_pick_index != null) {
      return derby.derby_order[derby.current_pick_index]?.user_id === currentUserId;
    }
    return false;
  });

  return (
    <>
      <div className={`rounded-lg bg-card shadow ${isDraftsExpanded ? 'p-6 glass-strong glow-border' : 'p-4 glass-subtle'}`}>
        <div className={`flex items-center justify-between ${isDraftsExpanded ? 'mb-4' : ''}`}>
          <button
            onClick={() => setIsDraftsExpanded((prev) => !prev)}
            className="flex flex-1 items-center gap-3"
          >
            <ChevronDown
              className={`h-5 w-5 text-muted-foreground transition-transform ${isDraftsExpanded ? '' : '-rotate-90'}`}
            />
            <h2 className="text-xl font-bold text-foreground">Drafts</h2>
            <span className="text-sm text-muted-foreground">
              {!isDraftsExpanded && activeDrafts.length > 0
                ? activeDrafts.map((d) => `${playerPoolLabel(d.settings.player_type)}: ${draftStatusLabels[d.status]}`).join(', ')
                : `${activeDrafts.length} active${completedDrafts.length > 0 ? `, ${completedDrafts.length} completed` : ''}`
              }
            </span>
            {isMyTurn && (
              <span
                className="rounded-full bg-neon-cyan/20 px-2 py-0.5 text-xs font-bold text-neon-cyan"
                style={{ animation: 'neon-pulse 2s ease-in-out infinite' }}
              >
                Your Pick!
              </span>
            )}
          </button>
        </div>

        {isDraftsExpanded && (<>
        {activeDrafts.length > 0 ? (
        <div className="space-y-4">
        {activeDrafts.map((draft) => {
          const draftShuffle = shuffleDisplay?.draftId === draft.id ? shuffleDisplay : null;
          const isDraftOrderOpen = expandedDraftOrders.has(draft.id);
          const isDerbyResultsOpen = expandedDerbyResults.has(draft.id);
          const toggleDraftOrder = () => setExpandedDraftOrders((prev) => {
            const next = new Set(prev);
            next.has(draft.id) ? next.delete(draft.id) : next.add(draft.id);
            return next;
          });
          const toggleDerbyResults = () => setExpandedDerbyResults((prev) => {
            const next = new Set(prev);
            next.has(draft.id) ? next.delete(draft.id) : next.add(draft.id);
            return next;
          });

          return (
            <div key={draft.id} className="rounded-lg border border-border p-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-foreground">{playerPoolLabel(draft.settings.player_type)}</h2>
                  {isCommissioner && (draft.status === 'pre_draft' || draft.status === 'drafting') && (
                    <button
                      onClick={() => onEditDraft(draft.id)}
                      className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-accent-foreground"
                      title="Draft Settings"
                    >
                      <Settings className="h-5 w-5" />
                    </button>
                  )}
                  {isCommissioner && draft.status === 'pre_draft' && (
                    <>
                      {draft.type !== 'slow_auction' && !(draft.metadata?.derby as any)?.status
                        && !(draft.settings.player_type === 1 && drafts.some((d) => d.settings.player_type === 2 && d.settings.include_rookie_picks === 1)) && (
                        <button
                          onClick={() => {
                            const hasOrder = Object.keys(draft.draft_order ?? {}).length > 0;
                            if (hasOrder) {
                              setReRandomizeDraftId(draft.id);
                              return;
                            }
                            onRandomizeDraftOrder(draft);
                          }}
                          disabled={draftShuffle !== null}
                          className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-accent-foreground disabled:opacity-50"
                          title={Object.keys(draft.draft_order ?? {}).length > 0 ? 'Re-randomize Draft Order' : 'Randomize Draft Order'}
                        >
                          <Shuffle className="h-5 w-5" />
                        </button>
                      )}
                    </>
                  )}
                </div>
                <span className={`rounded-full px-3 py-1 text-sm font-medium ${draftStatusColors[draft.status]}`}>
                  {draftStatusLabels[draft.status]}
                </span>
              </div>

              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Type</p>
                    <p className="font-medium text-foreground">{draftTypeLabels[draft.type] || draft.type}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Rounds</p>
                    <p className="font-medium text-foreground">{draft.settings.rounds}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Pick Timer</p>
                    <p className="font-medium text-foreground">
                      {(() => {
                        const t = draft.settings.pick_timer;
                        if (t === 0) return 'Off';
                        const h = Math.floor(t / 3600);
                        const m = Math.floor((t % 3600) / 60);
                        const s = t % 60;
                        return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`;
                      })()}
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  {draft.status === 'drafting' && (
                    <Link
                      href={`/leagues/${leagueId}/draft?draftId=${draft.id}`}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
                    >
                      Enter Draft Room
                    </Link>
                  )}
                  {draft.status === 'pre_draft' && (
                    <>
                      {isCommissioner && (draft.metadata?.order_method ?? 'randomize') === 'derby'
                        && Object.keys(draft.draft_order ?? {}).length > 0
                        && !(draft.metadata?.derby as any)?.status && (
                        <button
                          onClick={() => handleStartDerbyClick(draft)}
                          disabled={isStartingDerby}
                          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          {isStartingDerby ? 'Starting...' : 'Start Derby'}
                        </button>
                      )}
                      <Link
                        href={`/leagues/${leagueId}/draft?draftId=${draft.id}`}
                        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
                      >
                        Enter Draft Room
                      </Link>
                    </>
                  )}
                </div>

                {/* Derby Pick Board — shown when derby is active */}
                {(draft.metadata?.derby as any)?.status === 'active' && (
                  <DerbyPickBoard
                    draft={draft}
                    members={members}
                    userId={currentUserId}
                    isCommissioner={isCommissioner}
                    accessToken={accessToken!}
                    onDraftUpdated={onDraftUpdated}
                  />
                )}

                {/* Derby Results — collapsible, shown after derby completes */}
                {(draft.metadata?.derby as any)?.status === 'complete' && (() => {
                  const derby = draft.metadata?.derby as any;
                  return (
                    <div className="rounded-lg border border-border">
                      <button
                        type="button"
                        onClick={toggleDerbyResults}
                        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-accent-foreground hover:bg-accent rounded-lg"
                      >
                        <span>Derby Results ({derby.picks.length} picks)</span>
                        <ChevronDown className={`h-4 w-4 transition-transform ${isDerbyResultsOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isDerbyResultsOpen && (
                        <div className="border-t border-border px-4 py-3">
                          <ol className="space-y-1">
                            {derby.derby_order.map((entry: any, index: number) => {
                              const pick = derby.picks.find((p: any) => p.user_id === entry.user_id);
                              const member = members.find((m) => m.user_id === entry.user_id);
                              return (
                                <li
                                  key={entry.user_id}
                                  className="flex items-center justify-between text-sm"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="w-6 text-right font-medium text-muted-foreground">{index + 1}.</span>
                                    <span className="text-foreground">{member?.display_name || entry.username}</span>
                                  </div>
                                  {pick && (
                                    <span className="text-xs font-medium text-success-foreground">
                                      Slot #{pick.selected_slot}
                                    </span>
                                  )}
                                </li>
                              );
                            })}
                          </ol>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {(draft.metadata?.derby as any)?.status !== 'active' && (Object.keys(draft.slot_to_roster_id ?? {}).length > 0 || draftShuffle) && (
                  <div className="rounded-lg border border-border">
                    <button
                      type="button"
                      onClick={toggleDraftOrder}
                      className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-accent-foreground hover:bg-accent rounded-lg"
                    >
                      <span>Draft Order ({Object.keys(draft.slot_to_roster_id ?? {}).length} teams)</span>
                      <ChevronDown className={`h-4 w-4 transition-transform ${isDraftOrderOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isDraftOrderOpen && (
                      <div className="border-t border-border px-4 py-3">
                        <ol className="space-y-1">
                          {draftShuffle
                            ? draftShuffle.displayRosterIds.map((rosterId, index) => {
                                const roster = rosters.find((r) => r.roster_id === rosterId);
                                const member = roster?.owner_id ? members.find((m) => m.user_id === roster.owner_id) : null;
                                return (
                                  <li
                                    key={`slot-${index + 1}`}
                                    className={`flex items-center gap-2 text-sm transition-colors duration-150 ${
                                      index < draftShuffle.lockedCount
                                        ? 'text-foreground font-medium'
                                        : 'text-disabled'
                                    }`}
                                  >
                                    <span className="w-6 text-right font-medium text-muted-foreground">{index + 1}.</span>
                                    <span>{member ? (member.display_name || member.username) : <span className="italic text-muted-foreground">Team {rosterId}</span>}</span>
                                  </li>
                                );
                              })
                            : Object.entries(draft.slot_to_roster_id)
                                .sort(([a], [b]) => Number(a) - Number(b))
                                .map(([slotStr, rosterId]) => {
                                  const roster = rosters.find((r) => r.roster_id === rosterId);
                                  const member = roster?.owner_id ? members.find((m) => m.user_id === roster.owner_id) : null;
                                  return (
                                    <li
                                      key={`slot-${slotStr}`}
                                      className="flex items-center gap-2 text-sm text-foreground font-medium"
                                    >
                                      <span className="w-6 text-right font-medium text-muted-foreground">{slotStr}.</span>
                                      <span>{member ? (member.display_name || member.username) : <span className="italic text-muted-foreground">Team {rosterId}</span>}</span>
                                    </li>
                                  );
                                })
                          }
                        </ol>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        </div>
      ) : (
          <div className="text-center py-4">
            {completedDrafts.length === 0 && (
              <p className="text-muted-foreground">No draft has been created yet.</p>
            )}
            {completedDrafts.length > 0 && (
              <p className="text-muted-foreground">No active draft.</p>
            )}
          </div>
      )}

        {completedDrafts.length > 0 && (
          <div className="mt-5">
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Completed Drafts</h3>
            <div className="space-y-2">
              {completedDrafts.map((draft) => (
                <div
                  key={draft.id}
                  className="flex items-center justify-between rounded border border-border p-3"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="font-medium text-foreground">
                        {playerPoolLabel(draft.settings.player_type)} &middot; {draftTypeLabels[draft.type] || draft.type} &middot; {draft.season}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {draft.settings.rounds} rounds
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${draftStatusColors.complete}`}>
                      Complete
                    </span>
                    <Link
                      href={`/leagues/${leagueId}/draft?draftId=${draft.id}`}
                      className="rounded-lg bg-muted px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-muted-hover"
                    >
                      View Results
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        </>)}
      </div>

      {/* Re-randomize Confirmation Dialog */}
      {reRandomizeDraftId && (() => {
        const reRandomizeDraft = drafts.find((d) => d.id === reRandomizeDraftId);
        return reRandomizeDraft ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="rounded-lg bg-card p-6 shadow-xl max-w-sm w-full">
              <h3 className="text-lg font-semibold text-foreground mb-2">Confirm Action</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Draft order is already set. Are you sure you want to re-randomize?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setReRandomizeDraftId(null)}
                  className="rounded-lg bg-muted-hover px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-muted-hover"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setReRandomizeDraftId(null);
                    onRandomizeDraftOrder(reRandomizeDraft);
                  }}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
                >
                  Re-randomize
                </button>
              </div>
            </div>
          </div>
        ) : null;
      })()}
    </>
  );
}
