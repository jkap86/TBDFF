'use client';

import { ChevronDown, Swords } from 'lucide-react';

interface MatchupSetupEditorProps {
  matchupType: number;
  onMatchupTypeChange: (v: number) => void;
  showMatchups: boolean;
  onToggle: () => void;
  isSubmitting: boolean;
}

export function MatchupSetupEditor({
  matchupType,
  onMatchupTypeChange,
  showMatchups,
  onToggle,
  isSubmitting,
}: MatchupSetupEditorProps) {
  const summary = matchupType === 0 ? 'Random' : 'Derby';

  return (
    <div className="mb-4 rounded-lg border border-border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-accent-foreground hover:bg-accent rounded-lg"
      >
        <div className="flex items-center gap-2">
          <Swords className="h-4 w-4 text-muted-foreground" />
          <span>Matchup Generation</span>
        </div>
        <div className="flex items-center gap-2">
          {!showMatchups && <span className="text-xs text-muted-foreground">{summary}</span>}
          <ChevronDown className={`h-4 w-4 transition-transform ${showMatchups ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {showMatchups && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="matchupType"
              checked={matchupType === 0}
              onChange={() => onMatchupTypeChange(0)}
              className="mt-0.5 h-4 w-4 border-input text-primary focus:ring-ring"
              disabled={isSubmitting}
            />
            <div>
              <span className="text-sm font-medium text-accent-foreground">Randomize</span>
              <p className="text-xs text-muted-foreground">Computer generates a random round-robin schedule</p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="matchupType"
              checked={matchupType === 1}
              onChange={() => onMatchupTypeChange(1)}
              className="mt-0.5 h-4 w-4 border-input text-primary focus:ring-ring"
              disabled={isSubmitting}
            />
            <div>
              <span className="text-sm font-medium text-accent-foreground">Matchup Derby</span>
              <p className="text-xs text-muted-foreground">Owners take turns choosing their opponents each week in a live draft room</p>
            </div>
          </label>
        </div>
      )}
    </div>
  );
}
