'use client';

import { useState } from 'react';
import type { League, LeagueType } from '@tbdff/shared';
import { positionArrayToCounts } from '../config/roster-config';
import { scoringFromLeague } from '../config/scoring-config';
import { RosterPositionsEditor } from './RosterPositionsEditor';
import { ScoringSettingsEditor } from './ScoringSettingsEditor';
import { WaiverSettingsEditor } from './WaiverSettingsEditor';

const CURRENT_SEASON = new Date().getFullYear().toString();

export interface LeagueFormValues {
  name: string;
  totalRosters: number;
  leagueType: LeagueType;
  bestBall: boolean;
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
}

export function leagueToFormValues(league: League): LeagueFormValues {
  return {
    name: league.name,
    totalRosters: league.total_rosters,
    leagueType: (league.settings?.type ?? 0) as LeagueType,
    bestBall: league.settings?.best_ball === 1,
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
  const [showRoster, setShowRoster] = useState(false);
  const [showScoring, setShowScoring] = useState(false);
  const [showWaivers, setShowWaivers] = useState(false);

  const update = <K extends keyof LeagueFormValues>(key: K, value: LeagueFormValues[K]) => {
    onChange({ ...values, [key]: value });
  };

  const inputClass = 'w-full rounded border border-input px-3 py-2 bg-muted text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring';
  const labelClass = 'mb-1 block text-sm font-medium text-accent-foreground';

  return (
    <>
      {/* League Name */}
      <div className="mb-4">
        <label htmlFor="name" className={labelClass}>League Name</label>
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

      {/* Season (create only) */}
      {showSeason && (
        <div className="mb-4">
          <label className={labelClass}>Season</label>
          <div className="rounded border border-border bg-surface px-3 py-2 text-sm text-accent-foreground">
            {CURRENT_SEASON}
          </div>
        </div>
      )}

      {/* Visibility */}
      {showMemberCanInvite ? (
        <>
          <div className="mb-4">
            <label htmlFor="visibility" className={labelClass}>League Visibility</label>
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
            <div className="mb-4">
              <label htmlFor="invitePermission" className={labelClass}>Who can send invites?</label>
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
        <div className="mb-4">
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
      <div className="mb-4">
        <label htmlFor="totalRosters" className={labelClass}>Number of Teams</label>
        <select
          id="totalRosters"
          value={values.totalRosters}
          onChange={(e) => update('totalRosters', parseInt(e.target.value, 10))}
          className={inputClass}
          disabled={isSubmitting}
        >
          {teamOptions.map((num) => (
            <option key={num} value={num}>{num}</option>
          ))}
        </select>
      </div>

      {/* League Type */}
      <div className="mb-4">
        <label htmlFor="leagueType" className={labelClass}>League Type</label>
        <select
          id="leagueType"
          value={values.leagueType}
          onChange={(e) => update('leagueType', parseInt(e.target.value, 10) as LeagueType)}
          className={inputClass}
          disabled={isSubmitting}
        >
          <option value={0}>Redraft</option>
          <option value={2} disabled>Dynasty (Coming Soon)</option>
          <option value={1} disabled>Keeper (Coming Soon)</option>
        </select>
      </div>

      {/* Best Ball */}
      <div className="mb-4">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={values.bestBall}
            onChange={(e) => update('bestBall', e.target.checked)}
            className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
            disabled={isSubmitting}
          />
          <span className="text-sm font-medium text-accent-foreground">Best Ball</span>
        </label>
        <p className="mt-1 ml-7 text-xs text-muted-foreground">
          Lineups are automatically optimized each week — no need to set starters
        </p>
      </div>

      {/* Roster Positions */}
      <RosterPositionsEditor
        rosterCounts={values.rosterCounts}
        onCountChange={(key, value) => update('rosterCounts', { ...values.rosterCounts, [key]: value })}
        showRoster={showRoster}
        onToggle={() => setShowRoster(!showRoster)}
        isSubmitting={isSubmitting}
      />

      {/* Scoring Settings */}
      <ScoringSettingsEditor
        scoring={values.scoring}
        onScoringChange={(key, value) => update('scoring', { ...values.scoring, [key]: value })}
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

      {/* Slot for mode-specific sections (payments, roster assignments, danger zone) */}
      {children}
    </>
  );
}
