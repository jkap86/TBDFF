'use client';

import { useState, useEffect } from 'react';
import type { League } from '@tbdff/shared';
import { leagueApi } from '@tbdff/shared';
import { ApiError } from '@/lib/api';

const TIMER_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 30, label: '30 seconds' },
  { value: 60, label: '1 minute' },
  { value: 120, label: '2 minutes' },
  { value: 180, label: '3 minutes' },
  { value: 300, label: '5 minutes' },
];

const TIMEOUT_OPTIONS = [
  { value: 0, label: 'Auto-pick', description: 'Randomly select a valid matchup' },
  { value: 1, label: 'Skip', description: 'Skip the user and let them pick later' },
];

interface MatchupDerbySettingsModalProps {
  league: League;
  accessToken: string;
  onClose: () => void;
  onSaved: () => void;
}

export function MatchupDerbySettingsModal({
  league,
  accessToken,
  onClose,
  onSaved,
}: MatchupDerbySettingsModalProps) {
  const [timer, setTimer] = useState(league.settings?.matchup_derby_timer ?? 120);
  const [timeout, setTimeout_] = useState(league.settings?.matchup_derby_timeout ?? 0);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTimer(league.settings?.matchup_derby_timer ?? 120);
    setTimeout_(league.settings?.matchup_derby_timeout ?? 0);
  }, [league]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      await leagueApi.update(
        league.id,
        { settings: { matchup_derby_timer: timer, matchup_derby_timeout: timeout } },
        accessToken,
      );
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to save settings');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-lg bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-bold text-foreground">Derby Settings</h2>

        {error && (
          <div className="mb-4 rounded bg-destructive p-3 text-sm text-destructive-foreground">{error}</div>
        )}

        {/* Pick Timer */}
        <div className="mb-5">
          <label className="mb-2 block text-sm font-medium text-accent-foreground">Pick Timer</label>
          <div className="grid grid-cols-3 gap-2">
            {TIMER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTimer(opt.value)}
                className={`rounded border px-3 py-2 text-sm font-medium transition-colors ${
                  timer === opt.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-accent-foreground hover:bg-muted'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Timeout Action */}
        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-accent-foreground">On Timeout</label>
          <div className="space-y-2">
            {TIMEOUT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTimeout_(opt.value)}
                className={`w-full rounded border px-3 py-2.5 text-left transition-colors ${
                  timeout === opt.value
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-muted'
                }`}
              >
                <span className={`text-sm font-medium ${timeout === opt.value ? 'text-primary' : 'text-accent-foreground'}`}>
                  {opt.label}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">{opt.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded bg-muted-hover px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-muted-hover disabled:opacity-50"
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
