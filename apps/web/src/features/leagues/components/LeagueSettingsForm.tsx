'use client';

import { useState } from 'react';
import { Lock } from 'lucide-react';
import type { League, LeagueType, PayoutEntry } from '@tbdff/shared';
import { positionArrayToCounts } from '../config/roster-config';
import { scoringFromLeague } from '../config/scoring-config';
import { RosterPositionsEditor } from './RosterPositionsEditor';
import { ScoringSettingsEditor } from './ScoringSettingsEditor';
import { WaiverSettingsEditor } from './WaiverSettingsEditor';
import { DraftSetupEditor } from './DraftSetupEditor';
import { BasicSettingsEditor } from './BasicSettingsEditor';
import { MatchupSetupEditor } from './MatchupSetupEditor';

const CURRENT_SEASON = new Date().getFullYear().toString();

export interface LeagueFormValues {
  name: string;
  totalRosters: number;
  leagueType: LeagueType;
  bestBall: boolean;
  disableTrades: boolean;
  isPublic: boolean;
  memberCanInvite: boolean;
  rosterCounts: Record<string, number>;
  scoring: Record<string, number>;
  waiverType: number;
  waiverBudget: number;
  waiverBidMin: number;
  waiverDayOfWeek: number;
  waiverClearDays: number;
  dailyWaivers: boolean;
  dailyWaiversHour: number;
  draftSetup: number;
  matchupType: number;
  buyIn: number;
  payouts: PayoutEntry[];
}

export function leagueToFormValues(league: League): LeagueFormValues {
  return {
    name: league.name,
    totalRosters: league.total_rosters,
    leagueType: (league.settings?.type ?? 0) as LeagueType,
    bestBall: league.settings?.best_ball === 1,
    disableTrades: league.settings?.disable_trades === 1,
    isPublic: league.settings?.public === 1,
    memberCanInvite: league.settings?.member_can_invite === 1,
    rosterCounts: positionArrayToCounts(league.roster_positions ?? []),
    scoring: scoringFromLeague(league),
    waiverType: league.settings?.waiver_type ?? 2,
    waiverBudget: league.settings?.waiver_budget ?? 100,
    waiverBidMin: league.settings?.waiver_bid_min ?? 0,
    waiverDayOfWeek: league.settings?.waiver_day_of_week ?? 3,
    waiverClearDays: league.settings?.waiver_clear_days ?? 2,
    dailyWaivers: league.settings?.daily_waivers === 1,
    dailyWaiversHour: league.settings?.daily_waivers_hour ?? 0,
    draftSetup: league.settings?.draft_setup ?? 0,
    matchupType: league.settings?.matchup_type ?? 0,
    buyIn: ((league.settings as Record<string, unknown>).buy_in as number) ?? 0,
    payouts: ((league.settings as Record<string, unknown>).payouts as PayoutEntry[]) ?? [],
  };
}

interface LeagueSettingsFormProps {
  values: LeagueFormValues;
  onChange: (values: LeagueFormValues) => void;
  teamOptions: number[];
  showMemberCanInvite?: boolean;
  showSeason?: boolean;
  isSubmitting: boolean;
  children?: React.ReactNode;
}

export function LeagueSettingsForm({
  values,
  onChange,
  teamOptions,
  showMemberCanInvite,
  showSeason,
  isSubmitting,
  children,
}: LeagueSettingsFormProps) {
  const [showBasic, setShowBasic] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [showScoring, setShowScoring] = useState(false);
  const [showWaivers, setShowWaivers] = useState(false);
  const [showMatchupSetup, setShowMatchupSetup] = useState(false);

  const update = <K extends keyof LeagueFormValues>(key: K, value: LeagueFormValues[K]) => {
    onChange({ ...values, [key]: value });
  };

  const inputClass =
    'w-full rounded border border-input px-3 py-2 bg-muted text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring';
  const labelClass = 'mb-1 block text-sm font-medium text-accent-foreground';

  return (
    <>
      {/* League Info Card */}
      <div className="mb-4 rounded-lg border border-border px-4 py-4 space-y-4">
        {/* League Name + Season */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label htmlFor="name" className="block text-sm font-medium text-accent-foreground">
              League Name
            </label>
            {showSeason && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {CURRENT_SEASON} Season
              </span>
            )}
          </div>
          <input
            id="name"
            type="text"
            value={values.name}
            onChange={(e) => update('name', e.target.value)}
            className={inputClass}
            placeholder="My League"
            disabled={isSubmitting}
            maxLength={100}
            required
          />
        </div>

        {/* Visibility */}
        {showMemberCanInvite ? (
          <>
            <div>
              <label htmlFor="visibility" className={labelClass}>
                League Visibility
              </label>
              <select
                id="visibility"
                value={values.isPublic ? 'public' : 'private'}
                onChange={(e) => update('isPublic', e.target.value === 'public')}
                className={inputClass}
                disabled={isSubmitting}
              >
                <option value="public">Public - Anyone can find and join</option>
                <option value="private">Private - Invite only</option>
              </select>
            </div>
            {!values.isPublic && (
              <div>
                <label htmlFor="invitePermission" className={labelClass}>
                  Who can send invites?
                </label>
                <select
                  id="invitePermission"
                  value={values.memberCanInvite ? 'anyone' : 'commissioner'}
                  onChange={(e) => update('memberCanInvite', e.target.value === 'anyone')}
                  className={inputClass}
                  disabled={isSubmitting}
                >
                  <option value="commissioner">Commissioner only</option>
                  <option value="anyone">All members</option>
                </select>
              </div>
            )}
          </>
        ) : (
          <div>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={values.isPublic}
                onChange={(e) => update('isPublic', e.target.checked)}
                className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                disabled={isSubmitting}
              />
              <span className="text-sm font-medium text-accent-foreground">Public league</span>
            </label>
            <p className="mt-1 ml-7 text-xs text-muted-foreground">
              Anyone can browse and join public leagues
            </p>
          </div>
        )}

        {/* Number of Teams */}
        <div>
          <label htmlFor="totalRosters" className={labelClass}>
            Number of Teams
          </label>
          <select
            id="totalRosters"
            value={values.totalRosters}
            onChange={(e) => update('totalRosters', parseInt(e.target.value, 10))}
            className={inputClass}
            disabled={isSubmitting}
          >
            {teamOptions.map((num) => (
              <option key={num} value={num}>
                {num}
              </option>
            ))}
          </select>
        </div>

        {/* League Type — Visual Cards */}
        <div>
          <label className={labelClass}>League Type</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => update('leagueType', 0 as LeagueType)}
              disabled={isSubmitting}
              className={`rounded-lg border px-3 py-2.5 text-center transition-colors ${
                values.leagueType === 0
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/30'
              }`}
            >
              <div className="text-sm font-medium">Redraft</div>
              <div className="text-xs opacity-70 mt-0.5">New roster each year</div>
            </button>
            <button
              type="button"
              disabled
              className="relative rounded-lg border border-border bg-card px-3 py-2.5 text-center opacity-50 cursor-not-allowed"
            >
              <div className="text-sm font-medium text-muted-foreground">Dynasty</div>
              <div className="text-xs text-muted-foreground/70 mt-0.5">Keep your roster</div>
              <span className="absolute -top-2 right-1 flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                <Lock className="h-2.5 w-2.5" />
                Soon
              </span>
            </button>
            <button
              type="button"
              disabled
              className="relative rounded-lg border border-border bg-card px-3 py-2.5 text-center opacity-50 cursor-not-allowed"
            >
              <div className="text-sm font-medium text-muted-foreground">Keeper</div>
              <div className="text-xs text-muted-foreground/70 mt-0.5">Keep select players</div>
              <span className="absolute -top-2 right-1 flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                <Lock className="h-2.5 w-2.5" />
                Soon
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Basic Settings */}
      <BasicSettingsEditor
        bestBall={values.bestBall}
        onBestBallChange={(v) => update('bestBall', v)}
        disableTrades={values.disableTrades}
        onDisableTradesChange={(v) => update('disableTrades', v)}
        showBasic={showBasic}
        onToggle={() => setShowBasic(!showBasic)}
        isSubmitting={isSubmitting}
      />

      {/* Draft Setup (redraft only) */}
      {values.leagueType === 0 && (
        <DraftSetupEditor
          draftSetup={values.draftSetup}
          onDraftSetupChange={(v) => update('draftSetup', v)}
          showDrafts={showDrafts}
          onToggle={() => setShowDrafts(!showDrafts)}
          isSubmitting={isSubmitting}
        />
      )}

      {/* Roster Positions */}
      <RosterPositionsEditor
        rosterCounts={values.rosterCounts}
        onCountChange={(key, value) =>
          update('rosterCounts', { ...values.rosterCounts, [key]: value })
        }
        showRoster={showRoster}
        onToggle={() => setShowRoster(!showRoster)}
        isSubmitting={isSubmitting}
      />

      {/* Scoring Settings */}
      <ScoringSettingsEditor
        scoring={values.scoring}
        onScoringChange={(key, value) => update('scoring', { ...values.scoring, [key]: value })}
        onApplyPreset={(preset) => update('scoring', preset)}
        showScoring={showScoring}
        onToggle={() => setShowScoring(!showScoring)}
        isSubmitting={isSubmitting}
      />

      {/* Waiver Settings */}
      <WaiverSettingsEditor
        waiverType={values.waiverType}
        onWaiverTypeChange={(v) => update('waiverType', v)}
        waiverBudget={values.waiverBudget}
        onWaiverBudgetChange={(v) => update('waiverBudget', v)}
        waiverBidMin={values.waiverBidMin}
        onWaiverBidMinChange={(v) => update('waiverBidMin', v)}
        waiverDayOfWeek={values.waiverDayOfWeek}
        onWaiverDayOfWeekChange={(v) => update('waiverDayOfWeek', v)}
        waiverClearDays={values.waiverClearDays}
        onWaiverClearDaysChange={(v) => update('waiverClearDays', v)}
        dailyWaivers={values.dailyWaivers}
        onDailyWaiversChange={(v) => update('dailyWaivers', v)}
        dailyWaiversHour={values.dailyWaiversHour}
        onDailyWaiversHourChange={(v) => update('dailyWaiversHour', v)}
        showWaivers={showWaivers}
        onToggle={() => setShowWaivers(!showWaivers)}
        isSubmitting={isSubmitting}
      />

      {/* Matchup Generation */}
      <MatchupSetupEditor
        matchupType={values.matchupType}
        onMatchupTypeChange={(v) => update('matchupType', v)}
        showMatchups={showMatchupSetup}
        onToggle={() => setShowMatchupSetup(!showMatchupSetup)}
        isSubmitting={isSubmitting}
      />

      {/* Slot for mode-specific sections (payments, roster assignments, danger zone) */}
      {children}
    </>
  );
}
