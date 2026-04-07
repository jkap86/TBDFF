'use client';

import { useState } from 'react';
import type { NominationStatsResponse } from '@/lib/api';

interface SlowAuctionControlsProps {
  pickError: string | null;
  nominationStats: NominationStatsResponse | null;
  isCommissioner?: boolean;
  maxNominationsPerTeam?: number;
  maxNominationsGlobal?: number;
  dailyNominationLimit?: number;
  onUpdateTimers?: (timers: Record<string, number>) => void;
}

export function SlowAuctionControls({
  pickError,
  nominationStats,
  isCommissioner,
  maxNominationsPerTeam = 2,
  maxNominationsGlobal = 25,
  dailyNominationLimit = 0,
  onUpdateTimers,
}: SlowAuctionControlsProps) {
  const [showNomEdit, setShowNomEdit] = useState(false);
  const [localPerTeam, setLocalPerTeam] = useState(maxNominationsPerTeam);
  const [localGlobal, setLocalGlobal] = useState(maxNominationsGlobal);
  const [localDaily, setLocalDaily] = useState(dailyNominationLimit);

  const handleApply = () => {
    const updates: Record<string, number> = {};
    if (localPerTeam !== maxNominationsPerTeam) updates.max_nominations_per_team = localPerTeam;
    if (localGlobal !== maxNominationsGlobal) updates.max_nominations_global = localGlobal;
    if (localDaily !== dailyNominationLimit) updates.daily_nomination_limit = localDaily;
    if (Object.keys(updates).length > 0) onUpdateTimers?.(updates);
    setShowNomEdit(false);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
      <div className="flex flex-wrap items-center gap-4">
        {/* Nomination Stats */}
        {nominationStats && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              Your noms: <span className="font-medium text-accent-foreground">
                {nominationStats.active_nominations}/{maxNominationsPerTeam}
              </span>
            </span>
            <span>
              Active global: <span className="font-medium text-accent-foreground">
                {nominationStats.global_active}/{maxNominationsGlobal}
              </span>
            </span>
            {dailyNominationLimit > 0 && (
              <span>
                Daily: <span className="font-medium text-accent-foreground">
                  {nominationStats.daily_used}/{dailyNominationLimit}
                </span>
              </span>
            )}
          </div>
        )}

        {/* Commissioner nomination limit controls */}
        {isCommissioner && (
          <div className="flex items-center gap-1.5 ml-auto">
            <button
              onClick={() => {
                setLocalPerTeam(maxNominationsPerTeam);
                setLocalGlobal(maxNominationsGlobal);
                setLocalDaily(dailyNominationLimit);
                setShowNomEdit(!showNomEdit);
              }}
              className={`rounded-lg px-3 py-2 text-xs font-heading font-bold uppercase tracking-wide transition-colors ${
                showNomEdit
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'border border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/30'
              }`}
            >
              Noms
            </button>
            {showNomEdit && (
              <div className="flex items-center gap-2 border-l border-border pl-2 ml-0.5">
                <label className="flex items-center gap-1">
                  <span className="text-xs font-heading font-bold uppercase tracking-wide text-muted-foreground">Per Team</span>
                  <input
                    type="number"
                    value={localPerTeam}
                    onChange={(e) => setLocalPerTeam(Math.max(1, parseInt(e.target.value) || 1))}
                    min={1}
                    max={50}
                    className="w-14 rounded-lg border border-border bg-card px-1.5 py-1.5 text-center text-sm font-mono font-bold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </label>
                <label className="flex items-center gap-1">
                  <span className="text-xs font-heading font-bold uppercase tracking-wide text-muted-foreground">Global</span>
                  <input
                    type="number"
                    value={localGlobal}
                    onChange={(e) => setLocalGlobal(Math.max(1, parseInt(e.target.value) || 1))}
                    min={1}
                    max={200}
                    className="w-14 rounded-lg border border-border bg-card px-1.5 py-1.5 text-center text-sm font-mono font-bold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </label>
                {dailyNominationLimit > 0 && (
                  <label className="flex items-center gap-1">
                    <span className="text-xs font-heading font-bold uppercase tracking-wide text-muted-foreground">Daily</span>
                    <input
                      type="number"
                      value={localDaily}
                      onChange={(e) => setLocalDaily(Math.max(0, parseInt(e.target.value) || 0))}
                      min={0}
                      max={50}
                      className="w-14 rounded-lg border border-border bg-card px-1.5 py-1.5 text-center text-sm font-mono font-bold text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                  </label>
                )}
                <button
                  onClick={handleApply}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-heading font-bold uppercase tracking-wide text-primary-foreground hover:bg-primary-hover transition-colors"
                >
                  Apply
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {pickError && (
        <p className="mt-2 text-sm text-destructive-foreground">{pickError}</p>
      )}
    </div>
  );
}
