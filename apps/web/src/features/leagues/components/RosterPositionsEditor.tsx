'use client';

import { ChevronDown } from 'lucide-react';
import { ROSTER_POSITION_CONFIG } from '../config/roster-config';

interface RosterPositionsEditorProps {
  rosterCounts: Record<string, number>;
  onCountChange: (key: string, value: number) => void;
  showRoster: boolean;
  onToggle: () => void;
  isSubmitting: boolean;
}

export function RosterPositionsEditor({
  rosterCounts,
  onCountChange,
  showRoster,
  onToggle,
  isSubmitting,
}: RosterPositionsEditorProps) {
  return (
    <div className="mb-4 rounded-lg border border-border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-accent-foreground hover:bg-accent rounded-lg"
      >
        <span>Roster Positions</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${showRoster ? 'rotate-180' : ''}`} />
      </button>
      {showRoster && (
        <div className="border-t border-border px-4 py-3">
          <div className="grid grid-cols-2 gap-3">
            {ROSTER_POSITION_CONFIG.map((pos) => (
              <div key={pos.key} className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground truncate">{pos.label}</span>
                <input
                  type="number"
                  value={rosterCounts[pos.key] ?? 0}
                  onChange={(e) => onCountChange(pos.key, Math.max(pos.min, Math.min(pos.max, parseInt(e.target.value) || 0)))}
                  min={pos.min}
                  max={pos.max}
                  className="w-16 rounded border border-input px-2 py-1.5 text-sm text-center bg-muted text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  disabled={isSubmitting}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
