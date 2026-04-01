'use client';

import { ChevronDown, Sliders } from 'lucide-react';

interface BasicSettingsEditorProps {
  bestBall: boolean;
  onBestBallChange: (v: boolean) => void;
  disableTrades: boolean;
  onDisableTradesChange: (v: boolean) => void;
  showBasic: boolean;
  onToggle: () => void;
  isSubmitting: boolean;
}

export function BasicSettingsEditor({
  bestBall,
  onBestBallChange,
  disableTrades,
  onDisableTradesChange,
  showBasic,
  onToggle,
  isSubmitting,
}: BasicSettingsEditorProps) {
  const summaryParts: string[] = [];
  if (bestBall) summaryParts.push('Best Ball');
  if (disableTrades) summaryParts.push('No Trades');
  const summary = summaryParts.length > 0 ? summaryParts.join(', ') : 'Default';

  return (
    <div className="mb-4 rounded-lg border border-border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-accent-foreground hover:bg-accent rounded-lg"
      >
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-muted-foreground" />
          <span>Basic Settings</span>
        </div>
        <div className="flex items-center gap-2">
          {!showBasic && <span className="text-xs text-muted-foreground">{summary}</span>}
          <ChevronDown className={`h-4 w-4 transition-transform ${showBasic ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {showBasic && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={bestBall}
              onChange={(e) => onBestBallChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-ring"
              disabled={isSubmitting}
            />
            <div>
              <span className="text-sm font-medium text-accent-foreground">Best Ball</span>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={disableTrades}
              onChange={(e) => onDisableTradesChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-ring"
              disabled={isSubmitting}
            />
            <div>
              <span className="text-sm font-medium text-accent-foreground">Disable Trades</span>
            </div>
          </label>
        </div>
      )}
    </div>
  );
}
