'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Settings } from 'lucide-react';
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
  onOpenDerbySettings,
}: LeagueMatchupsCardProps) {
  const queryClient = useQueryClient();
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [isGeneratingMatchups, setIsGeneratingMatchups] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

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
    <div className="rounded-lg bg-card p-6 shadow">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Matchups</h2>
        {isCommissioner && (league.settings?.matchup_type ?? 0) === 0 && (
          <button
            onClick={handleGenerateMatchups}
            disabled={isGeneratingMatchups}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
          >
            {isGeneratingMatchups
              ? 'Generating...'
              : matchups.length > 0
                ? 'Re-Randomize Schedule'
                : 'Generate Schedule'}
          </button>
        )}
        {(league.settings?.matchup_type ?? 0) === 1 && (
          <div className="flex gap-2">
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
          </div>
        )}
      </div>

      {matchups.length > 0 ? (
        <div>
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
        <p className="py-4 text-center text-muted-foreground">
          {isCommissioner
            ? (league.settings?.matchup_type ?? 0) === 1
              ? 'No matchups yet. Enter the derby room to set the schedule.'
              : 'No matchups generated yet. Click the button above to generate the schedule.'
            : (league.settings?.matchup_type ?? 0) === 1
              ? 'No matchups yet. Enter the derby room to set the schedule.'
              : 'No matchups have been generated yet.'}
        </p>
      )}
    </div>
  );
}
