'use client';

import { useState, useEffect } from 'react';
import type { Draft, DraftType, UpdateDraftRequest } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { AuctionSettingsSection } from './AuctionSettingsSection';
import { SlowAuctionSettingsSection } from './SlowAuctionSettingsSection';
import { DerbySettingsSection } from './DerbySettingsSection';

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

interface DraftSettingsFormProps {
  draft: Draft;
  onSave: (updates: UpdateDraftRequest) => Promise<void>;
  onSaveTimers?: (timers: Record<string, number>) => Promise<void>;
  onSaveSuccess?: () => void;
  readOnly: boolean | 'timers-only';
  vetDraftIncludesRookiePicks?: boolean;
}

export function DraftSettingsForm({
  draft,
  onSave,
  onSaveTimers,
  onSaveSuccess,
  readOnly,
  vetDraftIncludesRookiePicks,
}: DraftSettingsFormProps) {
  const isTimersOnly = readOnly === 'timers-only';
  const [draftType, setDraftType] = useState<DraftType>(
    draft.type === '3rr' ? 'snake' : draft.type,
  );
  const [thirdRoundReversal, setThirdRoundReversal] = useState(draft.type === '3rr');
  const [rounds, setRounds] = useState(draft.settings.rounds);
  const [pickTimer, setPickTimer] = useState(draft.settings.pick_timer);
  const [nominationTimer, setNominationTimer] = useState(draft.settings.nomination_timer);
  const [offeringTimer, setOfferingTimer] = useState(draft.settings.offering_timer ?? 120);
  const [budget, setBudget] = useState(draft.settings.budget);
  const [maxPlayersPerTeam, setMaxPlayersPerTeam] = useState(
    draft.settings.max_players_per_team || draft.settings.rounds,
  );
  // Slow auction state
  const [bidWindowSeconds, setBidWindowSeconds] = useState(
    draft.settings.bid_window_seconds ?? 43200,
  );
  const [maxNominationsPerTeam, setMaxNominationsPerTeam] = useState(
    draft.settings.max_nominations_per_team ?? 2,
  );
  const [maxNominationsGlobal, setMaxNominationsGlobal] = useState(
    draft.settings.max_nominations_global ?? 25,
  );
  const [dailyNominationLimit, setDailyNominationLimit] = useState(
    draft.settings.daily_nomination_limit ?? 0,
  );
  const [minBid, setMinBid] = useState(draft.settings.min_bid ?? 1);
  const [minIncrement, setMinIncrement] = useState(draft.settings.min_increment ?? 1);
  const [maxLotDurationSeconds, setMaxLotDurationSeconds] = useState(
    draft.settings.max_lot_duration_seconds ?? 0,
  );
  const [orderMethod, setOrderMethod] = useState<'randomize' | 'derby'>(
    draft.metadata?.order_method ?? 'randomize',
  );
  // Derby settings
  const [derbyTimer, setDerbyTimer] = useState(draft.settings.derby_timer ?? 60);
  const [derbyTimeoutAction, setDerbyTimeoutAction] = useState(
    draft.settings.derby_timeout_action ?? 0,
  );
  // Rookie picks in vet draft
  const [includeRookiePicks, setIncludeRookiePicks] = useState(
    draft.settings.include_rookie_picks ?? 0,
  );

  // String states for pick timer inputs so clearing a field doesn't snap pickTimer to 0
  const [timerH, setTimerH] = useState(() => String(Math.floor(draft.settings.pick_timer / 3600)));
  const [timerM, setTimerM] = useState(() =>
    String(Math.floor((draft.settings.pick_timer % 3600) / 60)),
  );
  const [timerS, setTimerS] = useState(() => String(draft.settings.pick_timer % 60));

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when draft changes
  useEffect(() => {
    setDraftType(draft.type === '3rr' ? 'snake' : draft.type);
    setThirdRoundReversal(draft.type === '3rr');
    setRounds(draft.settings.rounds);
    const pt = draft.settings.pick_timer;
    setPickTimer(pt);
    setTimerH(String(Math.floor(pt / 3600)));
    setTimerM(String(Math.floor((pt % 3600) / 60)));
    setTimerS(String(pt % 60));
    setNominationTimer(draft.settings.nomination_timer);
    setOfferingTimer(draft.settings.offering_timer ?? 120);
    setBudget(draft.settings.budget);
    setMaxPlayersPerTeam(draft.settings.max_players_per_team || draft.settings.rounds);
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

  const handleSave = async () => {
    // In timers-only mode, only save timer fields via the dedicated endpoint
    if (isTimersOnly && onSaveTimers) {
      const timerUpdates: Record<string, number> = {};
      if (!isAnyAuction && pickTimer !== draft.settings.pick_timer)
        timerUpdates.pick_timer = pickTimer;
      if (isAuction && nominationTimer !== draft.settings.nomination_timer)
        timerUpdates.nomination_timer = nominationTimer;
      if (isAuction && offeringTimer !== (draft.settings.offering_timer ?? 120))
        timerUpdates.offering_timer = offeringTimer;
      if (isSlowAuction && bidWindowSeconds !== (draft.settings.bid_window_seconds ?? 43200))
        timerUpdates.bid_window_seconds = bidWindowSeconds;
      if (isSlowAuction && maxNominationsPerTeam !== (draft.settings.max_nominations_per_team ?? 2))
        timerUpdates.max_nominations_per_team = maxNominationsPerTeam;
      if (isSlowAuction && maxNominationsGlobal !== (draft.settings.max_nominations_global ?? 25))
        timerUpdates.max_nominations_global = maxNominationsGlobal;
      if (isSlowAuction && dailyNominationLimit !== (draft.settings.daily_nomination_limit ?? 0))
        timerUpdates.daily_nomination_limit = dailyNominationLimit;

      if (Object.keys(timerUpdates).length === 0) return;

      try {
        setIsSaving(true);
        setError(null);
        await onSaveTimers(timerUpdates);
        onSaveSuccess?.();
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('Failed to update timers');
        }
      } finally {
        setIsSaving(false);
      }
      return;
    }

    const updates: UpdateDraftRequest = {};

    const effectiveType: DraftType =
      draftType === 'snake' && thirdRoundReversal ? '3rr' : draftType;
    if (effectiveType !== draft.type) {
      updates.type = effectiveType;
    }

    const settingsUpdates: Record<string, number> = {};
    if (rounds !== draft.settings.rounds) settingsUpdates.rounds = rounds;
    if (!isAnyAuction && pickTimer !== draft.settings.pick_timer)
      settingsUpdates.pick_timer = pickTimer;
    if (isAuction && nominationTimer !== draft.settings.nomination_timer)
      settingsUpdates.nomination_timer = nominationTimer;
    if (isAuction && offeringTimer !== (draft.settings.offering_timer ?? 120))
      settingsUpdates.offering_timer = offeringTimer;
    if (isAnyAuction && budget !== draft.settings.budget) settingsUpdates.budget = budget;
    if (
      isAnyAuction &&
      maxPlayersPerTeam !== (draft.settings.max_players_per_team || draft.settings.rounds)
    )
      settingsUpdates.max_players_per_team = maxPlayersPerTeam;
    // Slow auction settings
    if (isSlowAuction) {
      if (bidWindowSeconds !== (draft.settings.bid_window_seconds ?? 43200))
        settingsUpdates.bid_window_seconds = bidWindowSeconds;
      if (maxNominationsPerTeam !== (draft.settings.max_nominations_per_team ?? 2))
        settingsUpdates.max_nominations_per_team = maxNominationsPerTeam;
      if (maxNominationsGlobal !== (draft.settings.max_nominations_global ?? 25))
        settingsUpdates.max_nominations_global = maxNominationsGlobal;
      if (dailyNominationLimit !== (draft.settings.daily_nomination_limit ?? 0))
        settingsUpdates.daily_nomination_limit = dailyNominationLimit;
      if (minBid !== (draft.settings.min_bid ?? 1)) settingsUpdates.min_bid = minBid;
      if (minIncrement !== (draft.settings.min_increment ?? 1))
        settingsUpdates.min_increment = minIncrement;
      if (maxLotDurationSeconds !== (draft.settings.max_lot_duration_seconds ?? 0))
        settingsUpdates.max_lot_duration_seconds = maxLotDurationSeconds;
    }

    // Derby settings
    if (orderMethod === 'derby') {
      if (derbyTimer !== (draft.settings.derby_timer ?? 60))
        settingsUpdates.derby_timer = derbyTimer;
      if (derbyTimeoutAction !== (draft.settings.derby_timeout_action ?? 0))
        settingsUpdates.derby_timeout_action = derbyTimeoutAction;
    }

    // Rookie picks setting (vet draft only)
    if (
      draft.settings.player_type === 2 &&
      includeRookiePicks !== (draft.settings.include_rookie_picks ?? 0)
    ) {
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
  if (readOnly === true) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-accent-foreground mb-2">Draft Format</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div className="text-muted-foreground">Type</div>
            <div className="font-medium text-foreground">
              {draft.type === '3rr'
                ? 'Snake (3rd Round Reversal)'
                : DRAFT_TYPE_OPTIONS.find((o) => o.value === draft.type)?.label}
            </div>
            <div className="text-muted-foreground">Player Pool</div>
            <div className="font-medium text-foreground">
              {PLAYER_TYPE_LABELS[draft.settings.player_type] ?? 'All Players'}
            </div>
            <div className="text-muted-foreground">Rounds</div>
            <div className="font-medium text-foreground">{draft.settings.rounds}</div>
            {draft.type !== 'slow_auction' && (
              <>
                <div className="text-muted-foreground">Draft Order</div>
                <div className="font-medium text-foreground capitalize">
                  {vetDraftIncludesRookiePicks
                    ? 'From Vet Draft Picks'
                    : (draft.metadata?.order_method ?? 'randomize')}
                </div>
              </>
            )}
            {(draft.metadata?.order_method ?? 'randomize') === 'derby' && (
              <>
                <div className="text-muted-foreground">Derby Timer</div>
                <div className="font-medium text-foreground">
                  {formatTimer(draft.settings.derby_timer ?? 60)}
                </div>
                <div className="text-muted-foreground">Timer Expiry</div>
                <div className="font-medium text-foreground">
                  {(draft.settings.derby_timeout_action ?? 0) === 0 ? 'Autopick' : 'Skip'}
                </div>
              </>
            )}
            {draft.type !== 'auction' && draft.type !== 'slow_auction' && (
              <>
                <div className="text-muted-foreground">Pick Timer</div>
                <div className="font-medium text-foreground">
                  {formatTimer(draft.settings.pick_timer)}
                </div>
              </>
            )}
            {draft.type === 'auction' && (
              <>
                <div className="text-muted-foreground">Max Players / Team</div>
                <div className="font-medium text-foreground">
                  {draft.settings.max_players_per_team || draft.settings.rounds}
                </div>
                <div className="text-muted-foreground">Offering Timer</div>
                <div className="font-medium text-foreground">
                  {formatTimer(draft.settings.offering_timer ?? 120)}
                </div>
                <div className="text-muted-foreground">Bid Timer</div>
                <div className="font-medium text-foreground">
                  {formatTimer(draft.settings.nomination_timer)}
                </div>
                <div className="text-muted-foreground">Budget</div>
                <div className="font-medium text-foreground">${draft.settings.budget}</div>
              </>
            )}
            {draft.type === 'slow_auction' && (
              <>
                <div className="text-muted-foreground">Budget</div>
                <div className="font-medium text-foreground">${draft.settings.budget}</div>
                <div className="text-muted-foreground">Bid Window</div>
                <div className="font-medium text-foreground">
                  {(draft.settings.bid_window_seconds ?? 43200) / 3600}h
                </div>
                <div className="text-muted-foreground">Max Noms / Team</div>
                <div className="font-medium text-foreground">
                  {draft.settings.max_nominations_per_team ?? 2}
                </div>
                <div className="text-muted-foreground">Max Active Global</div>
                <div className="font-medium text-foreground">
                  {draft.settings.max_nominations_global ?? 25}
                </div>
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
    <div className="space-y-5 flex flex-col items-center">
      {isTimersOnly && (
        <p className="text-xs text-muted-foreground w-full">Only timer settings can be changed while the draft is active.</p>
      )}
      {/* Draft Format */}
      {!isTimersOnly && <div className="w-full">
        <h3 className="text-sm font-semibold text-accent-foreground mb-3">Draft Format</h3>
        <div className="space-y-3">
          {/* Type + Rounds on one row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Type</label>
              <select
                value={draftType}
                onChange={(e) => {
                  const val = e.target.value as DraftType;
                  setDraftType(val);
                  if (val !== 'snake') setThirdRoundReversal(false);
                }}
                className="w-full rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {DRAFT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Rounds</label>
              <input
                type="number"
                value={rounds}
                onChange={(e) =>
                  setRounds(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))
                }
                min={1}
                max={50}
                className="w-full rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* 3rd Round Reversal (snake only) */}
          {draftType === 'snake' && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={thirdRoundReversal}
                onChange={(e) => setThirdRoundReversal(e.target.checked)}
                className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
              />
              <span className="text-sm font-medium text-accent-foreground">3rd Round Reversal</span>
              <span className="text-xs text-disabled">- reverses 3rd round order</span>
            </label>
          )}

          {/* Player Pool (read-only) */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Player Pool</span>
            <div className="text-right">
              <span className="text-sm font-medium text-accent-foreground">
                {PLAYER_TYPE_LABELS[draft.settings.player_type] ?? 'All Players'}
              </span>
              <span className="text-xs text-disabled ml-1.5">(league setting)</span>
            </div>
          </div>

          {/* Include Rookie Picks (vet draft only) */}
          {draft.settings.player_type === 2 && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeRookiePicks === 1}
                onChange={(e) => setIncludeRookiePicks(e.target.checked ? 1 : 0)}
                className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
              />
              <span className="text-sm font-medium text-accent-foreground">
                Include Rookie Draft Picks
              </span>
              <span className="text-xs text-disabled">- adds picks to pool</span>
            </label>
          )}
        </div>
      </div>}

      {/* Draft Order (non-slow_auction only) */}
      {!isTimersOnly && !isSlowAuction && (
        <div className="border-t border-border pt-4 w-full">
          <h3 className="text-sm font-semibold text-accent-foreground mb-3">Draft Order</h3>
          <div className="space-y-3">
            <div>
              {vetDraftIncludesRookiePicks ? (
                <p className="text-sm font-medium text-accent-foreground">
                  Determined by Vet Draft Picks
                </p>
              ) : (
                <div className="flex gap-5 justify-evenly">
                  {[
                    { value: 'randomize' as const, label: 'Randomize' },
                    { value: 'derby' as const, label: 'Derby' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setOrderMethod(opt.value)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors w-full ${
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

            {/* Derby Settings */}
            {orderMethod === 'derby' && (
              <DerbySettingsSection
                derbyTimer={derbyTimer}
                onDerbyTimerChange={setDerbyTimer}
                derbyTimeoutAction={derbyTimeoutAction}
                onDerbyTimeoutActionChange={setDerbyTimeoutAction}
              />
            )}
          </div>
        </div>
      )}

      {/* Timers (non-auction only) */}
      {!isAnyAuction && (
        <div className="border-t border-border pt-4 w-full">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-accent-foreground">Pick Timer</h3>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={pickTimer > 0}
                onChange={(e) => {
                  const val = e.target.checked ? 120 : 0;
                  setPickTimer(val);
                  setTimerH(String(Math.floor(val / 3600)));
                  setTimerM(String(Math.floor((val % 3600) / 60)));
                  setTimerS(String(val % 60));
                }}
                className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
              />
              <span className="text-xs text-accent-foreground">
                {pickTimer > 0 ? 'Enabled' : 'Off'}
              </span>
            </label>
          </div>

          <div
            className={
              'flex items-center justify-center gap-1.5 ' + (pickTimer === 0 ? 'opacity-30' : '')
            }
          >
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={timerH}
                onChange={(e) => {
                  setTimerH(e.target.value);
                  if (e.target.value === '') return;
                  const hrs = Math.max(0, Math.min(24, parseInt(e.target.value) || 0));
                  setPickTimer(hrs * 3600 + (pickTimer % 3600));
                }}
                onBlur={() => {
                  if (timerH === '') setTimerH(String(Math.floor(pickTimer / 3600)));
                }}
                min={0}
                max={24}
                className="w-14 rounded-lg border border-input px-2 py-2 text-sm text-center text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <span className="text-xs text-muted-foreground">h</span>
            </div>
            <span className="text-base font-medium text-muted-foreground">:</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={timerM}
                onChange={(e) => {
                  setTimerM(e.target.value);
                  if (e.target.value === '') return;
                  const mins = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                  const hrs = Math.floor(pickTimer / 3600);
                  const secs = pickTimer % 60;
                  setPickTimer(hrs * 3600 + mins * 60 + secs);
                }}
                onBlur={() => {
                  if (timerM === '') setTimerM(String(Math.floor((pickTimer % 3600) / 60)));
                }}
                min={0}
                max={59}
                className="w-14 rounded-lg border border-input px-2 py-2 text-sm text-center text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <span className="text-xs text-muted-foreground">m</span>
            </div>
            <span className="text-base font-medium text-muted-foreground">:</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={timerS}
                onChange={(e) => {
                  setTimerS(e.target.value);
                  if (e.target.value === '') return;
                  const secs = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                  const hrs = Math.floor(pickTimer / 3600);
                  const mins = Math.floor((pickTimer % 3600) / 60);
                  setPickTimer(hrs * 3600 + mins * 60 + secs);
                }}
                onBlur={() => {
                  if (timerS === '') setTimerS(String(pickTimer % 60));
                }}
                min={0}
                max={59}
                className="w-14 rounded-lg border border-input px-2 py-2 text-sm text-center text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <span className="text-xs text-muted-foreground">s</span>
            </div>
          </div>
        </div>
      )}

      {/* Auction Settings */}
      {isAnyAuction && (
        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-accent-foreground mb-3">{isTimersOnly ? 'Timer Settings' : 'Auction Settings'}</h3>
          <div className="space-y-3">
            <AuctionSettingsSection
              isAuction={isAuction}
              isSlowAuction={isSlowAuction}
              rounds={rounds}
              maxPlayersPerTeam={maxPlayersPerTeam}
              onMaxPlayersPerTeamChange={setMaxPlayersPerTeam}
              nominationTimer={nominationTimer}
              onNominationTimerChange={setNominationTimer}
              offeringTimer={offeringTimer}
              onOfferingTimerChange={setOfferingTimer}
              budget={budget}
              onBudgetChange={setBudget}
              timersOnly={isTimersOnly}
            />

            {/* Slow Auction Settings */}
            {isSlowAuction && (
              <SlowAuctionSettingsSection
                bidWindowSeconds={bidWindowSeconds}
                onBidWindowSecondsChange={setBidWindowSeconds}
                maxNominationsPerTeam={maxNominationsPerTeam}
                onMaxNominationsPerTeamChange={setMaxNominationsPerTeam}
                maxNominationsGlobal={maxNominationsGlobal}
                onMaxNominationsGlobalChange={setMaxNominationsGlobal}
                dailyNominationLimit={dailyNominationLimit}
                onDailyNominationLimitChange={setDailyNominationLimit}
                minBid={minBid}
                onMinBidChange={setMinBid}
                minIncrement={minIncrement}
                onMinIncrementChange={setMinIncrement}
                maxLotDurationSeconds={maxLotDurationSeconds}
                onMaxLotDurationSecondsChange={setMaxLotDurationSeconds}
                timersOnly={isTimersOnly}
              />
            )}
          </div>
        </div>
      )}

      {/* Error + Save */}
      {error && <p className="text-sm text-destructive-foreground">{error}</p>}
      <div className="flex justify-center items-center">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : isTimersOnly ? 'Update Timers' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
