'use client';

import { ChevronDown } from 'lucide-react';

interface DraftSetupEditorProps {
  draftSetup: number;
  onDraftSetupChange: (v: number) => void;
  showDrafts: boolean;
  onToggle: () => void;
  isSubmitting: boolean;
}

export function DraftSetupEditor({
  draftSetup,
  onDraftSetupChange,
  showDrafts,
  onToggle,
  isSubmitting,
}: DraftSetupEditorProps) {
  return (
    <div className="mb-4 rounded-lg border border-border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-accent-foreground hover:bg-accent rounded-lg"
      >
        <span>Draft Setup</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${showDrafts ? 'rotate-180' : ''}`} />
      </button>
      {showDrafts && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="draftSetup"
              checked={draftSetup === 0}
              onChange={() => onDraftSetupChange(0)}
              className="mt-0.5 h-4 w-4 border-input text-primary focus:ring-ring"
              disabled={isSubmitting}
            />
            <div>
              <span className="text-sm font-medium text-accent-foreground">1 Combined Draft</span>
              <p className="text-xs text-muted-foreground">All players in one draft</p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="draftSetup"
              checked={draftSetup === 1}
              onChange={() => onDraftSetupChange(1)}
              className="mt-0.5 h-4 w-4 border-input text-primary focus:ring-ring"
              disabled={isSubmitting}
            />
            <div>
              <span className="text-sm font-medium text-accent-foreground">Vet Draft + Rookie Draft</span>
              <p className="text-xs text-muted-foreground">Veterans in one draft, rookies in another</p>
            </div>
          </label>
        </div>
      )}
    </div>
  );
}
