'use client';

import { useState, useEffect } from 'react';
import type { Draft, DraftType, UpdateDraftRequest } from '@/lib/api';
import { ApiError } from '@/lib/api';

const DRAFT_TYPE_OPTIONS: { value: DraftType; label: string }[] = [
  { value: 'snake', label: 'Snake' },
  { value: 'linear', label: 'Linear' },
  { value: 'auction', label: 'Auction' },
  { value: 'slow_auction', label: 'Slow Auction' },
];

const PLAYER_TYPE_LABELS: Record<number, string> = {
  0: 'All Players',
  1: 'Rookies Only',
  2: 'Veterans Only',
};

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
  vetDraftIncludesRookiePicks?: boolean;
}

export function DraftSettingsForm({ draft, onSave, onSaveSuccess, readOnly, vetDraftIncludesRookiePicks }: DraftSettingsFormProps) {
  const [draftType, setDraftType] = useState<DraftType>(draft.type === '3rr' ? 'snake' : draft.type);
  const [thirdRoundReversal, setThirdRoundReversal] = useState(draft.type === '3rr');
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
  // Derby settings
  const [derbyTimer, setDerbyTimer] = useState(draft.settings.derby_timer ?? 60);
  const [derbyTimeoutAction, setDerbyTimeoutAction] = useState(draft.settings.derby_timeout_action ?? 0);
  // Rookie picks in vet draft
  const [includeRookiePicks, setIncludeRookiePicks] = useState(draft.settings.include_rookie_picks ?? 0);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customNomTimer, setCustomNomTimer] = useState('');
  const [customOfferingTimer, setCustomOfferingTimer] = useState('');

  // Reset form when draft changes
  useEffect(() => {
    setDraftType(draft.type === '3rr' ? 'snake' : draft.type);
    setThirdRoundReversal(draft.type === '3rr');
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
    setDerbyTimer(draft.settings.derby_timer ?? 60);
    setDerbyTimeoutAction(draft.settings.derby_timeout_action ?? 0);
    setIncludeRookiePicks(draft.settings.include_rookie_picks ?? 0);
    setError(null);
  }, [draft]);

  const isAuction = draftType === 'auction';
  const isSlowAuction = draftType === 'slow_auction';
  const isAnyAuction = isAuction || isSlowAuction;
  const isPresetNomTimer = NOMINATION_TIMER_PRESETS.some((p) => p.value === nominationTimer);
  const isPresetOfferingTimer = OFFERING_TIMER_PRESETS.some((p) => p.value === offeringTimer);
  const isPresetBidWindow = BID_WINDOW_PRESETS.some((p) => p.value === bidWindowSeconds);
  const handleSave = async () => {
    const updates: UpdateDraftRequest = {};

    const effectiveType: DraftType = draftType === 'snake' && thirdRoundReversal ? '3rr' : draftType;
    if (effectiveType !== draft.type) {
      updates.type = effectiveType;
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

    // Derby settings
    if (orderMethod === 'derby') {
      if (derbyTimer !== (draft.settings.derby_timer ?? 60)) settingsUpdates.derby_timer = derbyTimer;
      if (derbyTimeoutAction !== (draft.settings.derby_timeout_action ?? 0)) settingsUpdates.derby_timeout_action = derbyTimeoutAction;
    }

    // Rookie picks setting (vet draft only)
    if (draft.settings.player_type === 2 && includeRookiePicks !== (draft.settings.include_rookie_picks ?? 0)) {
      settingsUpdates.include_rookie_picks = includeRookiePicks;
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
          <h3 className="text-sm font-semibold text-accent-foreground mb-2">Draft Format</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div className="text-muted-foreground">Type</div>
            <div className="font-medium text-foreground">
              {draft.type === '3rr' ? 'Snake (3rd Round Reversal)' : DRAFT_TYPE_OPTIONS.find((o) => o.value === draft.type)?.label}
            </div>
            <div className="text-muted-foreground">Player Pool</div>
            <div className="font-medium text-foreground">{PLAYER_TYPE_LABELS[draft.settings.player_type] ?? 'All Players'}</div>
            <div className="text-muted-foreground">Rounds</div>
            <div className="font-medium text-foreground">{draft.settings.rounds}</div>
            {draft.type !== 'slow_auction' && (
              <>
                <div className="text-muted-foreground">Draft Order</div>
                <div className="font-medium text-foreground capitalize">
                  {vetDraftIncludesRookiePicks ? 'From Vet Draft Picks' : draft.metadata?.order_method ?? 'randomize'}
                </div>
              </>
            )}
            {(draft.metadata?.order_method ?? 'randomize') === 'derby' && (
              <>
                <div className="text-muted-foreground">Derby Timer</div>
                <div className="font-medium text-foreground">{formatTimer(draft.settings.derby_timer ?? 60)}</div>
                <div className="text-muted-foreground">Timer Expiry</div>
                <div className="font-medium text-foreground">
                  {(draft.settings.derby_timeout_action ?? 0) === 0 ? 'Autopick' : 'Skip'}
                </div>
              </>
            )}
            {draft.type !== 'auction' && draft.type !== 'slow_auction' && (
              <>
                <div className="text-muted-foreground">Pick Timer</div>
                <div className="font-medium text-foreground">{formatTimer(draft.settings.pick_timer)}</div>
              </>
            )}
            {draft.type === 'auction' && (
              <>
                <div className="text-muted-foreground">Max Players / Team</div>
                <div className="font-medium text-foreground">
                  {draft.settings.max_players_per_team ? draft.settings.max_players_per_team : `${draft.settings.rounds} (same as rounds)`}
                </div>
                <div className="text-muted-foreground">Offering Timer</div>
                <div className="font-medium text-foreground">{formatTimer(draft.settings.offering_timer ?? 120)}</div>
                <div className="text-muted-foreground">Bid Timer</div>
                <div className="font-medium text-foreground">{formatTimer(draft.settings.nomination_timer)}</div>
                <div className="text-muted-foreground">Budget</div>
                <div className="font-medium text-foreground">${draft.settings.budget}</div>
              </>
            )}
            {draft.type === 'slow_auction' && (
              <>
                <div className="text-muted-foreground">Budget</div>
                <div className="font-medium text-foreground">${draft.settings.budget}</div>
                <div className="text-muted-foreground">Bid Window</div>
                <div className="font-medium text-foreground">{(draft.settings.bid_window_seconds ?? 43200) / 3600}h</div>
                <div className="text-muted-foreground">Max Noms / Team</div>
                <div className="font-medium text-foreground">{draft.settings.max_nominations_per_team ?? 2}</div>
                <div className="text-muted-foreground">Max Active Global</div>
                <div className="font-medium text-foreground">{draft.settings.max_nominations_global ?? 25}</div>
                <div className="text-muted-foreground">Min Bid</div>
                <div className="font-medium text-foreground">${draft.settings.min_bid ?? 1}</div>
                {(draft.settings.max_lot_duration_seconds ?? 0) > 0 && (
                  <>
                    <div className="text-muted-foreground">Max Lot Duration</div>
                    <div className="font-medium text-foreground">
                      {Math.round((draft.settings.max_lot_duration_seconds ?? 0) / 86400)} days
                    </div>
                  </>
                )}
              </>
            )}
            {draft.settings.player_type === 2 && (
              <>
                <div className="text-muted-foreground">Rookie Picks</div>
                <div className="font-medium text-foreground">
                  {(draft.settings.include_rookie_picks ?? 0) === 1 ? 'Included in pool' : 'Off'}
                </div>
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
        <h3 className="text-sm font-semibold text-accent-foreground mb-3">Draft Format</h3>
        <div className="space-y-3">
          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Type</label>
            <select
              value={draftType}
              onChange={(e) => {
                const val = e.target.value as DraftType;
                setDraftType(val);
                if (val !== 'snake') setThirdRoundReversal(false);
              }}
              className="rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {DRAFT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* 3rd Round Reversal (snake only) */}
          {draftType === 'snake' && (
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={thirdRoundReversal}
                  onChange={(e) => setThirdRoundReversal(e.target.checked)}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                />
                <span className="text-sm font-medium text-accent-foreground">3rd Round Reversal</span>
              </label>
              <p className="text-xs text-disabled mt-0.5 ml-6">
                Reverses draft order in the 3rd round then continues alternating
              </p>
            </div>
          )}

          {/* Player Pool (read-only, managed by league settings) */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Player Pool</label>
            <p className="text-sm font-medium text-accent-foreground">
              {PLAYER_TYPE_LABELS[draft.settings.player_type] ?? 'All Players'}
            </p>
            <p className="text-xs text-disabled mt-0.5">Managed in league settings</p>
          </div>

          {/* Include Rookie Picks (vet draft only) */}
          {draft.settings.player_type === 2 && (
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeRookiePicks === 1}
                  onChange={(e) => setIncludeRookiePicks(e.target.checked ? 1 : 0)}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                />
                <span className="text-sm font-medium text-accent-foreground">Include Rookie Draft Picks</span>
              </label>
              <p className="text-xs text-disabled mt-0.5 ml-6">
                Rookie draft picks (1.01, 1.02, etc.) appear in the player pool
              </p>
            </div>
          )}

          {/* Rounds */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Rounds</label>
            <input
              type="number"
              value={rounds}
              onChange={(e) => setRounds(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
              min={1}
              max={50}
              className="w-20 rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Draft Order Method (non-slow_auction only) */}
          {!isSlowAuction && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Draft Order</label>
              {vetDraftIncludesRookiePicks ? (
                <p className="text-sm font-medium text-accent-foreground">Determined by Vet Draft Picks</p>
              ) : (
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
                          ? 'bg-primary text-primary-foreground ring-2 ring-ring'
                          : 'bg-muted text-accent-foreground hover:bg-muted-hover'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Derby Settings (shown when Derby selected) */}
          {orderMethod === 'derby' && !isSlowAuction && (
            <>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Derby Pick Timer</label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={derbyTimer > 0}
                      onChange={(e) => setDerbyTimer(e.target.checked ? 60 : 0)}
                      className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                    />
                    <span className="text-xs text-accent-foreground">{derbyTimer > 0 ? 'Enabled' : 'Off'}</span>
                  </label>
                  {derbyTimer > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={Math.floor(derbyTimer / 3600)}
                          onChange={(e) => {
                            const hrs = Math.max(0, Math.min(24, parseInt(e.target.value) || 0));
                            const remainingSecs = derbyTimer % 3600;
                            setDerbyTimer(hrs * 3600 + remainingSecs);
                          }}
                          min={0}
                          max={24}
                          className="w-14 rounded-lg border border-input px-2 py-2 text-sm text-center text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <span className="text-sm text-muted-foreground">h</span>
                      </div>
                      <span className="text-lg font-medium text-muted-foreground">:</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={Math.floor((derbyTimer % 3600) / 60)}
                          onChange={(e) => {
                            const mins = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                            const hrs = Math.floor(derbyTimer / 3600);
                            const secs = derbyTimer % 60;
                            setDerbyTimer(hrs * 3600 + mins * 60 + secs);
                          }}
                          min={0}
                          max={59}
                          className="w-14 rounded-lg border border-input px-2 py-2 text-sm text-center text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <span className="text-sm text-muted-foreground">m</span>
                      </div>
                      <span className="text-lg font-medium text-muted-foreground">:</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={derbyTimer % 60}
                          onChange={(e) => {
                            const secs = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                            const hrs = Math.floor(derbyTimer / 3600);
                            const mins = Math.floor((derbyTimer % 3600) / 60);
                            setDerbyTimer(hrs * 3600 + mins * 60 + secs);
                          }}
                          min={0}
                          max={59}
                          className="w-14 rounded-lg border border-input px-2 py-2 text-sm text-center text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <span className="text-sm text-muted-foreground">s</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Timer Expiry Action</label>
                <div className="flex gap-1.5">
                  {([
                    { value: 0, label: 'Autopick' },
                    { value: 1, label: 'Skip' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDerbyTimeoutAction(opt.value)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        derbyTimeoutAction === opt.value
                          ? 'bg-primary text-primary-foreground ring-2 ring-ring'
                          : 'bg-muted text-accent-foreground hover:bg-muted-hover'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-disabled mt-1">
                  {derbyTimeoutAction === 0
                    ? 'Random slot assigned when timer expires'
                    : 'User is skipped and can pick later at any time'}
                </p>
              </div>
            </>
          )}

          {/* Max Players Per Team (any auction) */}
          {isAnyAuction && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Max Players / Team</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={maxPlayersPerTeam}
                  onChange={(e) => setMaxPlayersPerTeam(Math.max(0, Math.min(50, parseInt(e.target.value) || 0)))}
                  min={0}
                  max={50}
                  className="w-20 rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <span className="text-xs text-disabled">0 = same as rounds</span>
              </div>
            </div>
          )}

          {/* Pick Timer (non-auction only) */}
          {!isAnyAuction && <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Pick Timer</label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={pickTimer > 0}
                  onChange={(e) => setPickTimer(e.target.checked ? 120 : 0)}
                  className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                />
                <span className="text-xs text-accent-foreground">{pickTimer > 0 ? 'Enabled' : 'Off'}</span>
              </label>
              {pickTimer > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={Math.floor(pickTimer / 3600)}
                      onChange={(e) => {
                        const hrs = Math.max(0, Math.min(24, parseInt(e.target.value) || 0));
                        const remainingSecs = pickTimer % 3600;
                        setPickTimer(hrs * 3600 + remainingSecs);
                      }}
                      min={0}
                      max={24}
                      className="w-14 rounded-lg border border-input px-2 py-2 text-sm text-center text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <span className="text-sm text-muted-foreground">h</span>
                  </div>
                  <span className="text-lg font-medium text-muted-foreground">:</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={Math.floor((pickTimer % 3600) / 60)}
                      onChange={(e) => {
                        const mins = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                        const hrs = Math.floor(pickTimer / 3600);
                        const secs = pickTimer % 60;
                        setPickTimer(hrs * 3600 + mins * 60 + secs);
                      }}
                      min={0}
                      max={59}
                      className="w-14 rounded-lg border border-input px-2 py-2 text-sm text-center text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <span className="text-sm text-muted-foreground">m</span>
                  </div>
                  <span className="text-lg font-medium text-muted-foreground">:</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={pickTimer % 60}
                      onChange={(e) => {
                        const secs = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                        const hrs = Math.floor(pickTimer / 3600);
                        const mins = Math.floor((pickTimer % 3600) / 60);
                        setPickTimer(hrs * 3600 + mins * 60 + secs);
                      }}
                      min={0}
                      max={59}
                      className="w-14 rounded-lg border border-input px-2 py-2 text-sm text-center text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <span className="text-sm text-muted-foreground">s</span>
                  </div>
                </div>
              )}
            </div>
          </div>}

          {/* Offering Timer (auction only) */}
          {isAuction && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Offering Timer</label>
              <div className="flex flex-wrap gap-1.5">
                {OFFERING_TIMER_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => { setOfferingTimer(preset.value); setCustomOfferingTimer(''); }}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      offeringTimer === preset.value
                        ? 'bg-primary text-primary-foreground ring-2 ring-ring'
                        : 'bg-muted text-accent-foreground hover:bg-muted-hover'
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
                    className="w-20 rounded-lg border border-input px-2 py-1.5 text-xs text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <span className="text-xs text-disabled">sec</span>
                </div>
              </div>
            </div>
          )}

          {/* Bid Timer (auction only) */}
          {isAuction && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Bid Timer</label>
              <div className="flex flex-wrap gap-1.5">
                {NOMINATION_TIMER_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => { setNominationTimer(preset.value); setCustomNomTimer(''); }}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      nominationTimer === preset.value
                        ? 'bg-primary text-primary-foreground ring-2 ring-ring'
                        : 'bg-muted text-accent-foreground hover:bg-muted-hover'
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
                    className="w-20 rounded-lg border border-input px-2 py-1.5 text-xs text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <span className="text-xs text-disabled">sec</span>
                </div>
              </div>
            </div>
          )}

          {/* Budget (any auction) */}
          {isAnyAuction && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Auction Budget</label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">$</span>
                <input
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(Math.max(1, Math.min(9999, parseInt(e.target.value) || 1)))}
                  min={1}
                  max={9999}
                  className="w-24 rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          )}

          {/* Slow Auction Settings */}
          {isSlowAuction && (
            <>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Bid Window</label>
                <div className="flex flex-wrap gap-1.5">
                  {BID_WINDOW_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setBidWindowSeconds(preset.value)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        bidWindowSeconds === preset.value
                          ? 'bg-primary text-primary-foreground ring-2 ring-ring'
                          : 'bg-muted text-accent-foreground hover:bg-muted-hover'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                  {!isPresetBidWindow && (
                    <span className="text-xs text-muted-foreground self-center">{Math.round(bidWindowSeconds / 3600)}h</span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Max Noms / Team</label>
                  <input
                    type="number"
                    value={maxNominationsPerTeam}
                    onChange={(e) => setMaxNominationsPerTeam(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                    min={1}
                    max={50}
                    className="w-20 rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Max Active Global</label>
                  <input
                    type="number"
                    value={maxNominationsGlobal}
                    onChange={(e) => setMaxNominationsGlobal(Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))}
                    min={1}
                    max={200}
                    className="w-20 rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Daily Nom Limit</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={dailyNominationLimit}
                      onChange={(e) => setDailyNominationLimit(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                      min={0}
                      max={100}
                      className="w-20 rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <span className="text-xs text-disabled">0 = unlimited</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Min Bid</label>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">$</span>
                    <input
                      type="number"
                      value={minBid}
                      onChange={(e) => setMinBid(Math.max(1, Math.min(999, parseInt(e.target.value) || 1)))}
                      min={1}
                      max={999}
                      className="w-20 rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Min Increment</label>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">$</span>
                    <input
                      type="number"
                      value={minIncrement}
                      onChange={(e) => setMinIncrement(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                      min={1}
                      max={100}
                      className="w-20 rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Max Lot Duration</label>
                <div className="flex flex-wrap gap-1.5">
                  {MAX_LOT_DURATION_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setMaxLotDurationSeconds(preset.value)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        maxLotDurationSeconds === preset.value
                          ? 'bg-primary text-primary-foreground ring-2 ring-ring'
                          : 'bg-muted text-accent-foreground hover:bg-muted-hover'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-disabled mt-1 block">
                  0 = lots can extend indefinitely
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Error + Save */}
      {error && (
        <p className="text-sm text-destructive-foreground">{error}</p>
      )}
      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
      >
        {isSaving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  );
}
