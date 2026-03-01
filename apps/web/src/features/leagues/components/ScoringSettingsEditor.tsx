'use client';

import { ChevronDown } from 'lucide-react';
import { SCORING_CATEGORIES } from '../config/scoring-config';

interface ScoringSettingsEditorProps {
  scoring: Record<string, number>;
  onScoringChange: (key: string, value: number) => void;
  showScoring: boolean;
  onToggle: () => void;
  isSubmitting: boolean;
}

export function ScoringSettingsEditor({
  scoring,
  onScoringChange,
  showScoring,
  onToggle,
  isSubmitting,
}: ScoringSettingsEditorProps) {
  return (
    <div className="mb-4 rounded-lg border border-border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-accent-foreground hover:bg-accent rounded-lg"
      >
        <span>Scoring Settings</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${showScoring ? 'rotate-180' : ''}`} />
      </button>
      {showScoring && (
        <div className="border-t border-border px-4 py-3 space-y-4">
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
