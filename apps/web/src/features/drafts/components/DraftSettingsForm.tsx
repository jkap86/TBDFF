'use client';

import { useState, useEffect } from 'react';
import type { Draft, DraftType, UpdateDraftRequest } from '@/lib/api';
import { ApiError } from '@/lib/api';

const DRAFT_TYPE_OPTIONS: { value: DraftType; label: string }[] = [
  { value: 'snake', label: 'Snake' },
  { value: 'linear', label: 'Linear' },
  { value: '3rr', label: '3rd Round Reversal' },
  { value: 'auction', label: 'Auction' },
  { value: 'slow_auction', label: 'Slow Auction' },
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

const OFFERING_TIMER_PRESETS = [
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '2m', value: 120 },
  { label: '5m', value: 300 },
];

const BID_WINDOW_PRESETS = [
  { label: '4h', value: 14400 },
  { label: '8h', value: 28800 },
  { label: '12h', value: 43200 },
  { label: '24h', value: 86400 },
  { label: '48h', value: 172800 },
];

const MAX_LOT_DURATION_PRESETS = [
  { label: 'No cap', value: 0 },
  { label: '3 days', value: 259200 },
  { label: '5 days', value: 432000 },
  { label: '7 days', value: 604800 },
  { label: '14 days', value: 1209600 },
];

interface DraftSettingsFormProps {
  draft: Draft;
  onSave: (updates: UpdateDraftRequest) => Promise<void>;
  onSaveSuccess?: () => void;
  readOnly: boolean;
}

export function DraftSettingsForm({ draft, onSave, onSaveSuccess, readOnly }: DraftSettingsFormProps) {
  const [draftType, setDraftType] = useState<DraftType>(draft.type);
  const [rounds, setRounds] = useState(draft.settings.rounds);
  const [pickTimer, setPickTimer] = useState(draft.settings.pick_timer);
  const [nominationTimer, setNominationTimer] = useState(draft.settings.nomination_timer);
  const [offeringTimer, setOfferingTimer] = useState(draft.settings.offering_timer ?? 120);
  const [budget, setBudget] = useState(draft.settings.budget);
  const [maxPlayersPerTeam, setMaxPlayersPerTeam] = useState(draft.settings.max_players_per_team ?? 0);
  // Slow auction state
  const [bidWindowSeconds, setBidWindowSeconds] = useState(draft.settings.bid_window_seconds ?? 43200);
  const [maxNominationsPerTeam, setMaxNominationsPerTeam] = useState(draft.settings.max_nominations_per_team ?? 2);
  const [maxNominationsGlobal, setMaxNominationsGlobal] = useState(draft.settings.max_nominations_global ?? 25);
  const [dailyNominationLimit, setDailyNominationLimit] = useState(draft.settings.daily_nomination_limit ?? 0);
  const [minBid, setMinBid] = useState(draft.settings.min_bid ?? 1);
  const [minIncrement, setMinIncrement] = useState(draft.settings.min_increment ?? 1);
  const [maxLotDurationSeconds, setMaxLotDurationSeconds] = useState(draft.settings.max_lot_duration_seconds ?? 0);
  const [orderMethod, setOrderMethod] = useState<'randomize' | 'derby'>(draft.metadata?.order_method ?? 'randomize');

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customTimer, setCustomTimer] = useState('');
  const [customNomTimer, setCustomNomTimer] = useState('');
  const [customOfferingTimer, setCustomOfferingTimer] = useState('');

  // Reset form when draft changes
  useEffect(() => {
    setDraftType(draft.type);
    setRounds(draft.settings.rounds);
    setPickTimer(draft.settings.pick_timer);
    setNominationTimer(draft.settings.nomination_timer);
    setOfferingTimer(draft.settings.offering_timer ?? 120);
    setBudget(draft.settings.budget);
    setMaxPlayersPerTeam(draft.settings.max_players_per_team ?? 0);
    setBidWindowSeconds(draft.settings.bid_window_seconds ?? 43200);
    setMaxNominationsPerTeam(draft.settings.max_nominations_per_team ?? 2);
    setMaxNominationsGlobal(draft.settings.max_nominations_global ?? 25);
    setDailyNominationLimit(draft.settings.daily_nomination_limit ?? 0);
    setMinBid(draft.settings.min_bid ?? 1);
    setMinIncrement(draft.settings.min_increment ?? 1);
    setMaxLotDurationSeconds(draft.settings.max_lot_duration_seconds ?? 0);
    setOrderMethod(draft.metadata?.order_method ?? 'randomize');
    setError(null);
  }, [draft]);

  const isAuction = draftType === 'auction';
  const isSlowAuction = draftType === 'slow_auction';
  const isAnyAuction = isAuction || isSlowAuction;
  const isPresetTimer = PICK_TIMER_PRESETS.some((p) => p.value === pickTimer);
  const isPresetNomTimer = NOMINATION_TIMER_PRESETS.some((p) => p.value === nominationTimer);
  const isPresetOfferingTimer = OFFERING_TIMER_PRESETS.some((p) => p.value === offeringTimer);
  const isPresetBidWindow = BID_WINDOW_PRESETS.some((p) => p.value === bidWindowSeconds);

  const handleSave = async () => {
    const updates: UpdateDraftRequest = {};

    if (draftType !== draft.type) {
      updates.type = draftType;
    }

    const settingsUpdates: Record<string, number> = {};
    if (rounds !== draft.settings.rounds) settingsUpdates.rounds = rounds;
    if (!isAnyAuction && pickTimer !== draft.settings.pick_timer) settingsUpdates.pick_timer = pickTimer;
    if (isAuction && nominationTimer !== draft.settings.nomination_timer) settingsUpdates.nomination_timer = nominationTimer;
    if (isAuction && offeringTimer !== (draft.settings.offering_timer ?? 120)) settingsUpdates.offering_timer = offeringTimer;
    if (isAnyAuction && budget !== draft.settings.budget) settingsUpdates.budget = budget;
    if (isAnyAuction && maxPlayersPerTeam !== (draft.settings.max_players_per_team ?? 0)) settingsUpdates.max_players_per_team = maxPlayersPerTeam;
    // Slow auction settings
    if (isSlowAuction) {
      if (bidWindowSeconds !== (draft.settings.bid_window_seconds ?? 43200)) settingsUpdates.bid_window_seconds = bidWindowSeconds;
      if (maxNominationsPerTeam !== (draft.settings.max_nominations_per_team ?? 2)) settingsUpdates.max_nominations_per_team = maxNominationsPerTeam;
      if (maxNominationsGlobal !== (draft.settings.max_nominations_global ?? 25)) settingsUpdates.max_nominations_global = maxNominationsGlobal;
      if (dailyNominationLimit !== (draft.settings.daily_nomination_limit ?? 0)) settingsUpdates.daily_nomination_limit = dailyNominationLimit;
      if (minBid !== (draft.settings.min_bid ?? 1)) settingsUpdates.min_bid = minBid;
      if (minIncrement !== (draft.settings.min_increment ?? 1)) settingsUpdates.min_increment = minIncrement;
      if (maxLotDurationSeconds !== (draft.settings.max_lot_duration_seconds ?? 0)) settingsUpdates.max_lot_duration_seconds = maxLotDurationSeconds;
    }

    if (Object.keys(settingsUpdates).length > 0) {
      updates.settings = settingsUpdates;
    }

    if (orderMethod !== (draft.metadata?.order_method ?? 'randomize')) {
      updates.metadata = { ...draft.metadata, order_method: orderMethod };
    }

    if (Object.keys(updates).length === 0) return;

    try {
      setIsSaving(true);
      setError(null);
      await onSave(updates);
      onSaveSuccess?.();
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
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Draft Format</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div className="text-gray-500 dark:text-gray-400">Type</div>
            <div className="font-medium text-gray-900 dark:text-white">{DRAFT_TYPE_OPTIONS.find((o) => o.value === draft.type)?.label}</div>
            <div className="text-gray-500 dark:text-gray-400">Rounds</div>
            <div className="font-medium text-gray-900 dark:text-white">{draft.settings.rounds}</div>
            {draft.type !== 'slow_auction' && (
              <>
                <div className="text-gray-500 dark:text-gray-400">Draft Order</div>
                <div className="font-medium text-gray-900 dark:text-white capitalize">{draft.metadata?.order_method ?? 'randomize'}</div>
              </>
            )}
            {draft.type !== 'auction' && draft.type !== 'slow_auction' && (
              <>
                <div className="text-gray-500 dark:text-gray-400">Pick Timer</div>
                <div className="font-medium text-gray-900 dark:text-white">{formatTimer(draft.settings.pick_timer)}</div>
              </>
            )}
            {draft.type === 'auction' && (
              <>
                <div className="text-gray-500 dark:text-gray-400">Max Players / Team</div>
                <div className="font-medium text-gray-900 dark:text-white">
                  {draft.settings.max_players_per_team ? draft.settings.max_players_per_team : `${draft.settings.rounds} (same as rounds)`}
                </div>
                <div className="text-gray-500 dark:text-gray-400">Offering Timer</div>
                <div className="font-medium text-gray-900 dark:text-white">{formatTimer(draft.settings.offering_timer ?? 120)}</div>
                <div className="text-gray-500 dark:text-gray-400">Bid Timer</div>
                <div className="font-medium text-gray-900 dark:text-white">{formatTimer(draft.settings.nomination_timer)}</div>
                <div className="text-gray-500 dark:text-gray-400">Budget</div>
                <div className="font-medium text-gray-900 dark:text-white">${draft.settings.budget}</div>
              </>
            )}
            {draft.type === 'slow_auction' && (
              <>
                <div className="text-gray-500 dark:text-gray-400">Budget</div>
                <div className="font-medium text-gray-900 dark:text-white">${draft.settings.budget}</div>
                <div className="text-gray-500 dark:text-gray-400">Bid Window</div>
                <div className="font-medium text-gray-900 dark:text-white">{(draft.settings.bid_window_seconds ?? 43200) / 3600}h</div>
                <div className="text-gray-500 dark:text-gray-400">Max Noms / Team</div>
                <div className="font-medium text-gray-900 dark:text-white">{draft.settings.max_nominations_per_team ?? 2}</div>
                <div className="text-gray-500 dark:text-gray-400">Max Active Global</div>
                <div className="font-medium text-gray-900 dark:text-white">{draft.settings.max_nominations_global ?? 25}</div>
                <div className="text-gray-500 dark:text-gray-400">Min Bid</div>
                <div className="font-medium text-gray-900 dark:text-white">${draft.settings.min_bid ?? 1}</div>
                {(draft.settings.max_lot_duration_seconds ?? 0) > 0 && (
                  <>
                    <div className="text-gray-500 dark:text-gray-400">Max Lot Duration</div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      {Math.round((draft.settings.max_lot_duration_seconds ?? 0) / 86400)} days
                    </div>
                  </>
                )}
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
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Draft Format</h3>
        <div className="space-y-3">
          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Type</label>
            <select
              value={draftType}
              onChange={(e) => setDraftType(e.target.value as DraftType)}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white dark:bg-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {DRAFT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Rounds */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Rounds</label>
            <input
              type="number"
              value={rounds}
              onChange={(e) => setRounds(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
              min={1}
              max={50}
              className="w-20 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white dark:bg-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Draft Order Method (non-slow_auction only) */}
          {!isSlowAuction && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Draft Order</label>
              <div className="flex gap-1.5">
                {([
                  { value: 'randomize' as const, label: 'Randomize' },
                  { value: 'derby' as const, label: 'Derby' },
                ]).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setOrderMethod(opt.value)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      orderMethod === opt.value
                        ? 'border-blue-300 bg-blue-100 text-blue-700'
                        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Max Players Per Team (any auction) */}
          {isAnyAuction && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Max Players / Team</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={maxPlayersPerTeam}
                  onChange={(e) => setMaxPlayersPerTeam(Math.max(0, Math.min(50, parseInt(e.target.value) || 0)))}
                  min={0}
                  max={50}
                  className="w-20 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white dark:bg-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-400 dark:text-gray-500">0 = same as rounds</span>
              </div>
            </div>
          )}

          {/* Pick Timer (non-auction only) */}
          {!isAnyAuction && <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Pick Timer</label>
            <div className="flex flex-wrap gap-1.5">
              {PICK_TIMER_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => { setPickTimer(preset.value); setCustomTimer(''); }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    pickTimer === preset.value
                      ? 'border-blue-300 bg-blue-100 text-blue-700'
                      : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
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
                  className="w-20 rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-xs text-gray-900 dark:text-white dark:bg-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-400 dark:text-gray-500">sec</span>
              </div>
            </div>
          </div>}

          {/* Offering Timer (auction only) */}
          {isAuction && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Offering Timer</label>
              <div className="flex flex-wrap gap-1.5">
                {OFFERING_TIMER_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => { setOfferingTimer(preset.value); setCustomOfferingTimer(''); }}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      offeringTimer === preset.value
                        ? 'border-blue-300 bg-blue-100 text-blue-700'
                        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={!isPresetOfferingTimer ? offeringTimer : customOfferingTimer}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setCustomOfferingTimer(e.target.value);
                      setOfferingTimer(Math.max(0, Math.min(86400, val)));
                    }}
                    placeholder="Custom"
                    min={0}
                    max={86400}
                    className="w-20 rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-xs text-gray-900 dark:text-white dark:bg-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="text-xs text-gray-400 dark:text-gray-500">sec</span>
                </div>
              </div>
            </div>
          )}

          {/* Bid Timer (auction only) */}
          {isAuction && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Bid Timer</label>
              <div className="flex flex-wrap gap-1.5">
                {NOMINATION_TIMER_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => { setNominationTimer(preset.value); setCustomNomTimer(''); }}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      nominationTimer === preset.value
                        ? 'border-blue-300 bg-blue-100 text-blue-700'
                        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
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
                    className="w-20 rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-xs text-gray-900 dark:text-white dark:bg-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="text-xs text-gray-400 dark:text-gray-500">sec</span>
                </div>
              </div>
            </div>
          )}

          {/* Budget (any auction) */}
          {isAnyAuction && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Auction Budget</label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500 dark:text-gray-400">$</span>
                <input
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(Math.max(1, Math.min(9999, parseInt(e.target.value) || 1)))}
                  min={1}
                  max={9999}
                  className="w-24 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white dark:bg-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* Slow Auction Settings */}
          {isSlowAuction && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Bid Window</label>
                <div className="flex flex-wrap gap-1.5">
                  {BID_WINDOW_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setBidWindowSeconds(preset.value)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        bidWindowSeconds === preset.value
                          ? 'border-blue-300 bg-blue-100 text-blue-700'
                          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                  {!isPresetBidWindow && (
                    <span className="text-xs text-gray-500 self-center">{Math.round(bidWindowSeconds / 3600)}h</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Max Noms / Team</label>
                  <input
                    type="number"
                    value={maxNominationsPerTeam}
                    onChange={(e) => setMaxNominationsPerTeam(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                    min={1}
                    max={50}
                    className="w-20 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white dark:bg-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Max Active Global</label>
                  <input
                    type="number"
                    value={maxNominationsGlobal}
                    onChange={(e) => setMaxNominationsGlobal(Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))}
                    min={1}
                    max={200}
                    className="w-20 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white dark:bg-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Daily Nom Limit</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={dailyNominationLimit}
                      onChange={(e) => setDailyNominationLimit(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                      min={0}
                      max={100}
                      className="w-20 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white dark:bg-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-400 dark:text-gray-500">0 = unlimited</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Min Bid</label>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-gray-500 dark:text-gray-400">$</span>
                    <input
                      type="number"
                      value={minBid}
                      onChange={(e) => setMinBid(Math.max(1, Math.min(999, parseInt(e.target.value) || 1)))}
                      min={1}
                      max={999}
                      className="w-20 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white dark:bg-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Min Increment</label>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-gray-500 dark:text-gray-400">$</span>
                    <input
                      type="number"
                      value={minIncrement}
                      onChange={(e) => setMinIncrement(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                      min={1}
                      max={100}
                      className="w-20 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white dark:bg-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Max Lot Duration</label>
                <div className="flex flex-wrap gap-1.5">
                  {MAX_LOT_DURATION_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setMaxLotDurationSeconds(preset.value)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        maxLotDurationSeconds === preset.value
                          ? 'border-blue-300 bg-blue-100 text-blue-700'
                          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500 mt-1 block">
                  0 = lots can extend indefinitely
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Error + Save */}
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
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
