'use client';

import { useState } from 'react';
import { Settings, Info, X } from 'lucide-react';
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
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  const scoringLabel = league.scoring_settings?.rec === 1
    ? 'PPR'
    : league.scoring_settings?.rec === 0.5
      ? 'Half-PPR'
      : 'Standard';

  const buyIn = (league.settings as Record<string, unknown>)?.buy_in as number | undefined;
  const hasBuyIn = buyIn != null && buyIn > 0;

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
          <p className="text-sm text-muted-foreground">Type</p>
          <p className="text-lg font-medium text-foreground">
            {league.settings?.type === 0
              ? 'Redraft'
              : league.settings?.type === 1
                ? 'Keeper'
                : 'Dynasty'}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Scoring</p>
          <p className="text-lg font-medium text-foreground">{scoringLabel}</p>
        </div>
        {hasBuyIn && (
          <div>
            <p className="text-sm text-muted-foreground">Buy-In</p>
            <p className="text-lg font-medium text-foreground">${buyIn}</p>
          </div>
        )}
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => setIsInfoOpen(true)}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-accent-foreground"
            title="Scoring & Roster Info"
          >
            <Info className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* League Info Modal (Scoring + Roster Positions) */}
      {isInfoOpen && (() => {
        const scoring = scoringFromLeague(league);
        const counts = positionArrayToCounts(league.roster_positions ?? []);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setIsInfoOpen(false)}>
            <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-card p-6 shadow-xl glass-strong" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-foreground font-heading">League Info</h2>
                <button type="button" onClick={() => setIsInfoOpen(false)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-accent-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Roster Positions */}
              <div className="mb-5">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Roster Positions ({(league.roster_positions ?? []).length} slots)
                </h3>
                <div className="grid grid-cols-1 gap-y-1">
                  {ROSTER_POSITION_CONFIG.filter((pos) => counts[pos.key] > 0).map((pos) => (
                    <div key={pos.key} className="flex items-center justify-between text-sm">
                      <span className="text-accent-foreground">{pos.label}</span>
                      <span className="font-medium text-foreground">{counts[pos.key]}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Scoring Settings */}
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Scoring Settings ({scoringLabel})
                </h3>
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
          </div>
        );
      })()}
    </div>
  );
}
