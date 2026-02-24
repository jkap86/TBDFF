'use client';

import { useState, useEffect } from 'react';
import type { Draft, DraftType, UpdateDraftRequest } from '@/lib/api';
import { ApiError } from '@/lib/api';

const DRAFT_TYPE_OPTIONS: { value: DraftType; label: string }[] = [
  { value: 'snake', label: 'Snake' },
  { value: 'linear', label: 'Linear' },
  { value: '3rr', label: '3rd Round Reversal' },
  { value: 'auction', label: 'Auction' },
];

const PICK_TIMER_PRESETS = [
  { label: 'None', value: 0 },
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '1.5m', value: 90 },
  { label: '2m', value: 120 },
  { label: '5m', value: 300 },
];

const NOMINATION_TIMER_PRESETS = [
  { label: '15s', value: 15 },
  { label: '30s', value: 30 },
  { label: '45s', value: 45 },
  { label: '1m', value: 60 },
];

interface DraftSettingsFormProps {
  draft: Draft;
  onSave: (updates: UpdateDraftRequest) => Promise<void>;
  readOnly: boolean;
}

export function DraftSettingsForm({ draft, onSave, readOnly }: DraftSettingsFormProps) {
  const [draftType, setDraftType] = useState<DraftType>(draft.type);
  const [rounds, setRounds] = useState(draft.settings.rounds);
  const [pickTimer, setPickTimer] = useState(draft.settings.pick_timer);
  const [nominationTimer, setNominationTimer] = useState(draft.settings.nomination_timer);
  const [budget, setBudget] = useState(draft.settings.budget);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customTimer, setCustomTimer] = useState('');
  const [customNomTimer, setCustomNomTimer] = useState('');

  // Reset form when draft changes
  useEffect(() => {
    setDraftType(draft.type);
    setRounds(draft.settings.rounds);
    setPickTimer(draft.settings.pick_timer);
    setNominationTimer(draft.settings.nomination_timer);
    setBudget(draft.settings.budget);
    setError(null);
  }, [draft]);

  const isAuction = draftType === 'auction';
  const isPresetTimer = PICK_TIMER_PRESETS.some((p) => p.value === pickTimer);
  const isPresetNomTimer = NOMINATION_TIMER_PRESETS.some((p) => p.value === nominationTimer);

  const handleSave = async () => {
    const updates: UpdateDraftRequest = {};

    if (draftType !== draft.type) {
      updates.type = draftType;
    }

    const settingsUpdates: Record<string, number> = {};
    if (rounds !== draft.settings.rounds) settingsUpdates.rounds = rounds;
    if (pickTimer !== draft.settings.pick_timer) settingsUpdates.pick_timer = pickTimer;
    if (nominationTimer !== draft.settings.nomination_timer) settingsUpdates.nomination_timer = nominationTimer;
    if (budget !== draft.settings.budget) settingsUpdates.budget = budget;

    if (Object.keys(settingsUpdates).length > 0) {
      updates.settings = settingsUpdates;
    }

    if (Object.keys(updates).length === 0) return;

    try {
      setIsSaving(true);
      setError(null);
      await onSave(updates);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to update settings');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const formatTimer = (seconds: number) => {
    if (seconds === 0) return 'None';
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  };

  // Read-only view
  if (readOnly) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Draft Format</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div className="text-gray-500">Type</div>
            <div className="font-medium text-gray-900">{DRAFT_TYPE_OPTIONS.find((o) => o.value === draft.type)?.label}</div>
            <div className="text-gray-500">Rounds</div>
            <div className="font-medium text-gray-900">{draft.settings.rounds}</div>
            <div className="text-gray-500">Pick Timer</div>
            <div className="font-medium text-gray-900">{formatTimer(draft.settings.pick_timer)}</div>
            {draft.type === 'auction' && (
              <>
                <div className="text-gray-500">Nomination Timer</div>
                <div className="font-medium text-gray-900">{formatTimer(draft.settings.nomination_timer)}</div>
                <div className="text-gray-500">Budget</div>
                <div className="font-medium text-gray-900">${draft.settings.budget}</div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Editable view
  return (
    <div className="space-y-5">
      {/* Draft Format */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Draft Format</h3>
        <div className="space-y-3">
          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
            <select
              value={draftType}
              onChange={(e) => setDraftType(e.target.value as DraftType)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {DRAFT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Rounds */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Rounds</label>
            <input
              type="number"
              value={rounds}
              onChange={(e) => setRounds(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
              min={1}
              max={50}
              className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Pick Timer */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Pick Timer</label>
            <div className="flex flex-wrap gap-1.5">
              {PICK_TIMER_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => { setPickTimer(preset.value); setCustomTimer(''); }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    pickTimer === preset.value
                      ? 'border-blue-300 bg-blue-100 text-blue-700'
                      : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={!isPresetTimer ? pickTimer : customTimer}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    setCustomTimer(e.target.value);
                    setPickTimer(Math.max(0, Math.min(86400, val)));
                  }}
                  placeholder="Custom"
                  min={0}
                  max={86400}
                  className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-400">sec</span>
              </div>
            </div>
          </div>

          {/* Nomination Timer (auction only) */}
          {isAuction && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Nomination Timer</label>
              <div className="flex flex-wrap gap-1.5">
                {NOMINATION_TIMER_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => { setNominationTimer(preset.value); setCustomNomTimer(''); }}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      nominationTimer === preset.value
                        ? 'border-blue-300 bg-blue-100 text-blue-700'
                        : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={!isPresetNomTimer ? nominationTimer : customNomTimer}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setCustomNomTimer(e.target.value);
                      setNominationTimer(Math.max(0, Math.min(86400, val)));
                    }}
                    placeholder="Custom"
                    min={0}
                    max={86400}
                    className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="text-xs text-gray-400">sec</span>
                </div>
              </div>
            </div>
          )}

          {/* Budget (auction only) */}
          {isAuction && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Auction Budget</label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">$</span>
                <input
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(Math.max(1, Math.min(9999, parseInt(e.target.value) || 1)))}
                  min={1}
                  max={9999}
                  className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error + Save */}
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isSaving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  );
}
