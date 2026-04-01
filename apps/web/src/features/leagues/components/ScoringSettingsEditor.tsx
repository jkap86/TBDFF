'use client';

import { ChevronDown, Trophy } from 'lucide-react';
import { SCORING_CATEGORIES, DEFAULT_SCORING } from '../config/scoring-config';

const SCORING_PRESETS: { label: string; rec: number }[] = [
  { label: 'Standard', rec: 0 },
  { label: 'Half PPR', rec: 0.5 },
  { label: 'Full PPR', rec: 1 },
];

interface ScoringSettingsEditorProps {
  scoring: Record<string, number>;
  onScoringChange: (key: string, value: number) => void;
  onApplyPreset?: (preset: Record<string, number>) => void;
  showScoring: boolean;
  onToggle: () => void;
  isSubmitting: boolean;
}

export function ScoringSettingsEditor({
  scoring,
  onScoringChange,
  onApplyPreset,
  showScoring,
  onToggle,
  isSubmitting,
}: ScoringSettingsEditorProps) {
  const rec = scoring.rec ?? 0;
  const summary = rec === 1 ? 'PPR' : rec === 0.5 ? 'Half PPR' : rec === 0 ? 'Standard' : 'Custom';

  return (
    <div className="mb-4 rounded-lg border border-border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-accent-foreground hover:bg-accent rounded-lg"
      >
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-muted-foreground" />
          <span>Scoring Settings</span>
        </div>
        <div className="flex items-center gap-2">
          {!showScoring && <span className="text-xs text-muted-foreground">{summary}</span>}
          <ChevronDown className={`h-4 w-4 transition-transform ${showScoring ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {showScoring && (
        <div className="border-t border-border px-4 py-3 space-y-4">
          {/* Scoring Presets */}
          {onApplyPreset && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Preset:</span>
              {SCORING_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onApplyPreset({ ...DEFAULT_SCORING, rec: preset.rec })}
                  disabled={isSubmitting}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    rec === preset.rec
                      ? 'bg-primary/10 text-primary border border-primary/30'
                      : 'border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}
          {SCORING_CATEGORIES.map((cat) => (
            <div key={cat.title}>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {cat.title}
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {cat.fields.map((f) => (
                  <div key={f.key} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground truncate">{f.label}</span>
                    <input
                      type="number"
                      step="any"
                      value={scoring[f.key] ?? f.defaultVal}
                      onChange={(e) => onScoringChange(f.key, parseFloat(e.target.value) || 0)}
                      className="w-16 rounded border border-input px-2 py-1.5 text-sm text-center bg-muted text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                      disabled={isSubmitting}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
