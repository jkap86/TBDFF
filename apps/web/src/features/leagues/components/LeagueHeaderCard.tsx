'use client';

import { useState } from 'react';
import { Settings, Trophy, Users2, X } from 'lucide-react';
import { SCORING_CATEGORIES, scoringFromLeague } from '@/features/leagues/config/scoring-config';
import { ROSTER_POSITION_CONFIG, positionArrayToCounts } from '@/features/leagues/config/roster-config';
import { statusColors, statusLabels } from '@/features/leagues/config/league-detail-constants';
import type { League } from '@tbdff/shared';

interface LeagueHeaderCardProps {
  league: League;
  isCommissioner: boolean;
  onOpenSettings: () => void;
}

export function LeagueHeaderCard({ league, isCommissioner, onOpenSettings }: LeagueHeaderCardProps) {
  const [isScoringOpen, setIsScoringOpen] = useState(false);
  const [isRosterOpen, setIsRosterOpen] = useState(false);

  return (
    <div className="rounded-lg bg-card p-6 shadow">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-foreground">{league.name}</h1>
          {isCommissioner && (
            <button
              onClick={onOpenSettings}
              className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-accent-foreground"
              title="League Settings"
            >
              <Settings className="h-5 w-5" />
            </button>
          )}
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${statusColors[league.status] || statusColors.not_filled}`}
        >
          {statusLabels[league.status] || league.status}
        </span>
      </div>

      <div className="flex gap-4 justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Season</p>
          <p className="text-lg font-medium text-foreground">{league.season}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Teams</p>
          <p className="text-lg font-medium text-foreground">{league.total_rosters}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">League Type</p>
          <p className="text-lg font-medium text-foreground">
            {league.settings?.type === 0
              ? 'Redraft'
              : league.settings?.type === 1
                ? 'Keeper'
                : 'Dynasty'}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Starters</p>
          <p className="text-lg font-medium text-foreground">
            {(league.roster_positions ?? []).filter(p => p !== 'BN' && p !== 'IR').length}
          </p>
        </div>
      </div>

      {/* Scoring Settings & Roster Positions Buttons */}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setIsScoringOpen(true)}
          className="min-w-0 flex-1 flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-3 text-sm font-medium text-accent-foreground hover:bg-accent"
        >
          <Trophy className="h-4 w-4 text-muted-foreground" />
          <span>Scoring Settings</span>
          <span className="text-xs text-muted-foreground">
            ({league.scoring_settings?.rec === 1 ? 'PPR' : league.scoring_settings?.rec === 0.5 ? 'Half-PPR' : 'Standard'})
          </span>
        </button>
        <button
          type="button"
          onClick={() => setIsRosterOpen(true)}
          className="min-w-0 flex-1 flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-3 text-sm font-medium text-accent-foreground hover:bg-accent"
        >
          <Users2 className="h-4 w-4 text-muted-foreground" />
          <span>Roster Positions</span>
          <span className="text-xs text-muted-foreground">
            ({(league.roster_positions ?? []).length} slots)
          </span>
        </button>
      </div>

      {/* Scoring Settings Modal */}
      {isScoringOpen && (() => {
        const scoring = scoringFromLeague(league);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setIsScoringOpen(false)}>
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-card p-6 shadow-xl glass-strong" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-foreground font-heading">Scoring Settings</h2>
                <button type="button" onClick={() => setIsScoringOpen(false)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-accent-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4">
                {SCORING_CATEGORIES.map((cat) => (
                  <div key={cat.title}>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{cat.title}</h4>
                    <div className="grid grid-cols-1 gap-y-0.5">
                      {cat.fields.map((f) => (
                        <div key={f.key} className="flex items-center justify-between text-sm">
                          <span className="text-accent-foreground">{f.label}</span>
                          <span className="font-medium text-foreground">{scoring[f.key]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Roster Positions Modal */}
      {isRosterOpen && (() => {
        const counts = positionArrayToCounts(league.roster_positions ?? []);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setIsRosterOpen(false)}>
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-card p-6 shadow-xl glass-strong" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-foreground font-heading">Roster Positions</h2>
                <button type="button" onClick={() => setIsRosterOpen(false)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-accent-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-y-1">
                {ROSTER_POSITION_CONFIG.filter((pos) => counts[pos.key] > 0).map((pos) => (
                  <div key={pos.key} className="flex items-center justify-between text-sm">
                    <span className="text-accent-foreground">{pos.label}</span>
                    <span className="font-medium text-foreground">{counts[pos.key]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
