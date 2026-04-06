'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Settings, ChevronDown, Shuffle } from 'lucide-react';
import { matchupApi, ApiError } from '@/lib/api';
import type { League, LeagueMember, Roster, Matchup } from '@tbdff/shared';

interface LeagueMatchupsCardProps {
  league: League;
  leagueId: string;
  matchups: Matchup[];
  members: LeagueMember[];
  rosters: Roster[];
  isCommissioner: boolean;
  accessToken: string | null;
  initialExpanded?: boolean;
  currentUserId?: string;
  onOpenDerbySettings: () => void;
}

export function LeagueMatchupsCard({
  league,
  leagueId,
  matchups,
  members,
  rosters,
  isCommissioner,
  accessToken,
  initialExpanded = false,
  currentUserId,
  onOpenDerbySettings,
}: LeagueMatchupsCardProps) {
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [isGeneratingMatchups, setIsGeneratingMatchups] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [confirmReRandomize, setConfirmReRandomize] = useState(false);

  const handleGenerateMatchups = async () => {
    if (!accessToken) return;

    try {
      setIsGeneratingMatchups(true);
      setMutationError(null);
      const result = await matchupApi.generate(leagueId, accessToken);
      queryClient.setQueryData(['matchups', leagueId], result);
      setSelectedWeek(1);
    } catch (err) {
      if (err instanceof ApiError) {
        setMutationError(err.message);
      }
    } finally {
      setIsGeneratingMatchups(false);
    }
  };

  const getRosterLabel = (rosterId: number) => {
    const roster = rosters.find((r) => r.roster_id === rosterId);
    if (roster?.owner_id) {
      const member = members.find((m) => m.user_id === roster.owner_id);
      return member?.display_name || member?.username || `Team ${rosterId}`;
    }
    return `Team ${rosterId}`;
  };

  return (
    <div className={`rounded-lg bg-card shadow ${isExpanded ? 'p-6 glass-strong glow-border' : 'p-4 glass-subtle'}`}>
      <div className={`flex items-center justify-between ${isExpanded ? 'mb-4' : ''}`}>
        <button
          onClick={() => setIsExpanded((prev) => !prev)}
          className="flex flex-1 items-center gap-3"
        >
          <ChevronDown
            className={`h-5 w-5 text-muted-foreground transition-transform ${isExpanded ? '' : '-rotate-90'}`}
          />
          <h2 className="text-xl font-bold text-foreground">Matchups</h2>
          <span className="text-sm text-muted-foreground">
            {(() => {
              if (matchups.length === 0) return 'No schedule';
              if (isExpanded) return `${new Set(matchups.map((m) => m.week)).size} weeks`;
              // Rich summary when collapsed: show current user's matchup
              const currentUserRosterId = rosters.find((r) => r.owner_id === currentUserId)?.roster_id;
              const weeks = [...new Set(matchups.map((m) => m.week))].sort((a, b) => a - b);
              const currentWeek = (league.settings as any)?.leg ?? weeks[0] ?? 1;
              if (currentUserRosterId) {
                const myMatchup = matchups.find((m) => m.week === currentWeek && m.roster_id === currentUserRosterId);
                if (myMatchup && myMatchup.matchup_id > 0) {
                  const opponent = matchups.find(
                    (m) => m.week === currentWeek && m.matchup_id === myMatchup.matchup_id && m.roster_id !== currentUserRosterId,
                  );
                  if (opponent) return `Wk ${currentWeek}: vs ${getRosterLabel(opponent.roster_id)}`;
                }
              }
              return `${weeks.length} weeks`;
            })()}
          </span>
        </button>
      </div>

      {isExpanded && (<>
      {matchups.length > 0 ? (
        <div>
          {isCommissioner && (league.settings?.matchup_type ?? 0) === 0 && (
            <div className="mb-4 flex items-center justify-end gap-2">
              {confirmReRandomize ? (
                <>
                  <span className="text-sm text-warning">Re-randomize schedule?</span>
                  <button
                    onClick={() => { setConfirmReRandomize(false); handleGenerateMatchups(); }}
                    disabled={isGeneratingMatchups}
                    className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
                  >
                    {isGeneratingMatchups ? 'Generating...' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => setConfirmReRandomize(false)}
                    className="rounded-lg bg-muted px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-muted-hover"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmReRandomize(true)}
                  disabled={isGeneratingMatchups}
                  className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-accent-foreground disabled:opacity-50"
                  title="Re-Randomize Schedule"
                >
                  <Shuffle className="h-5 w-5" />
                </button>
              )}
            </div>
          )}
          {/* Week selector */}
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {Array.from(new Set(matchups.map((m) => m.week)))
              .sort((a, b) => a - b)
              .map((week) => (
                <button
                  key={week}
                  onClick={() => setSelectedWeek(week)}
                  className={`rounded-full px-3 py-1 text-sm font-medium whitespace-nowrap ${
                    selectedWeek === week
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-accent-foreground hover:bg-muted-hover'
                  }`}
                >
                  Wk {week}
                </button>
              ))}
          </div>

          {/* Matchup pairings for selected week */}
          <div className="space-y-2">
            {(() => {
              const weekMatchups = matchups.filter(
                (m) => m.week === selectedWeek && m.matchup_id > 0
              );
              const grouped: Record<number, Matchup[]> = {};
              for (const m of weekMatchups) {
                if (!grouped[m.matchup_id]) grouped[m.matchup_id] = [];
                grouped[m.matchup_id].push(m);
              }

              const byes = matchups.filter(
                (m) => m.week === selectedWeek && m.matchup_id === 0
              );

              return (
                <>
                  {Object.values(grouped).map((pair) => (
                    <div
                      key={pair[0].id}
                      className="flex items-center justify-between rounded border border-border p-3"
                    >
                      <span className="font-medium text-foreground">
                        {getRosterLabel(pair[0].roster_id)}
                      </span>
                      <span className="text-sm text-disabled">vs</span>
                      <span className="font-medium text-foreground">
                        {pair[1] ? getRosterLabel(pair[1].roster_id) : 'BYE'}
                      </span>
                    </div>
                  ))}
                  {byes.map((bye) => (
                    <div
                      key={bye.id}
                      className="flex items-center justify-between rounded border border-border bg-surface p-3"
                    >
                      <span className="font-medium text-foreground">
                        {getRosterLabel(bye.roster_id)}
                      </span>
                      <span className="text-sm italic text-disabled">BYE</span>
                    </div>
                  ))}
                </>
              );
            })()}
          </div>
        </div>
      ) : (
        <div className="flex justify-center gap-2 py-4">
          {isCommissioner && (league.settings?.matchup_type ?? 0) === 0 && (
            <button
              onClick={handleGenerateMatchups}
              disabled={isGeneratingMatchups}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
            >
              {isGeneratingMatchups ? 'Generating...' : 'Generate Schedule'}
            </button>
          )}
          {(league.settings?.matchup_type ?? 0) === 1 && (
            <>
              {isCommissioner && (
                <button
                  onClick={onOpenDerbySettings}
                  className="rounded-lg bg-muted px-3 py-2 text-accent-foreground hover:bg-muted-hover"
                  title="Derby Settings"
                >
                  <Settings className="h-4 w-4" />
                </button>
              )}
              <Link
                href={`/leagues/${leagueId}/matchup-derby`}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
              >
                Enter Derby Room
              </Link>
            </>
          )}
        </div>
      )}
      </>)}
    </div>
  );
}
