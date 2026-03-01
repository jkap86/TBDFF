'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { leagueApi, ApiError } from '@/lib/api';
import type { RosterPosition, LeagueType } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';

const CURRENT_SEASON = new Date().getFullYear().toString();

// Roster position config: order, labels, defaults, and bounds
const ROSTER_POSITION_CONFIG: { key: RosterPosition; label: string; defaultCount: number; min: number; max: number }[] = [
  { key: 'QB', label: 'QB', defaultCount: 1, min: 0, max: 5 },
  { key: 'RB', label: 'RB', defaultCount: 2, min: 0, max: 8 },
  { key: 'WR', label: 'WR', defaultCount: 2, min: 0, max: 8 },
  { key: 'TE', label: 'TE', defaultCount: 1, min: 0, max: 5 },
  { key: 'FLEX', label: 'FLEX (RB/WR/TE)', defaultCount: 2, min: 0, max: 8 },
  { key: 'SUPER_FLEX', label: 'SUPER FLEX (QB/RB/WR/TE)', defaultCount: 1, min: 0, max: 5 },
  { key: 'REC_FLEX', label: 'REC FLEX (WR/TE)', defaultCount: 0, min: 0, max: 5 },
  { key: 'WRRB_FLEX', label: 'WRRB FLEX (WR/RB)', defaultCount: 0, min: 0, max: 5 },
  { key: 'K', label: 'K', defaultCount: 1, min: 0, max: 3 },
  { key: 'DEF', label: 'DEF', defaultCount: 1, min: 0, max: 3 },
  { key: 'BN', label: 'Bench', defaultCount: 5, min: 0, max: 15 },
  { key: 'IR', label: 'IR', defaultCount: 1, min: 0, max: 5 },
];

const DEFAULT_ROSTER_COUNTS: Record<string, number> = {};
for (const pos of ROSTER_POSITION_CONFIG) {
  DEFAULT_ROSTER_COUNTS[pos.key] = pos.defaultCount;
}

// Scoring config: categories with fields, labels, and PPR defaults
const SCORING_CATEGORIES: { title: string; fields: { key: string; label: string; defaultVal: number }[] }[] = [
  {
    title: 'Passing',
    fields: [
      { key: 'pass_td', label: 'Pass TD', defaultVal: 4 },
      { key: 'pass_yd', label: 'Pass Yard', defaultVal: 0.04 },
      { key: 'pass_int', label: 'Interception', defaultVal: -2 },
      { key: 'pass_2pt', label: 'Pass 2PT', defaultVal: 2 },
    ],
  },
  {
    title: 'Rushing',
    fields: [
      { key: 'rush_td', label: 'Rush TD', defaultVal: 6 },
      { key: 'rush_yd', label: 'Rush Yard', defaultVal: 0.1 },
      { key: 'rush_2pt', label: 'Rush 2PT', defaultVal: 2 },
    ],
  },
  {
    title: 'Receiving',
    fields: [
      { key: 'rec', label: 'Reception (PPR)', defaultVal: 1 },
      { key: 'rec_td', label: 'Rec TD', defaultVal: 6 },
      { key: 'rec_yd', label: 'Rec Yard', defaultVal: 0.1 },
      { key: 'rec_2pt', label: 'Rec 2PT', defaultVal: 2 },
    ],
  },
  {
    title: 'Misc Offense',
    fields: [
      { key: 'fum', label: 'Fumble', defaultVal: 0 },
      { key: 'fum_lost', label: 'Fumble Lost', defaultVal: -2 },
      { key: 'fum_rec_td', label: 'Fumble Rec TD', defaultVal: 6 },
    ],
  },
  {
    title: 'Kicking',
    fields: [
      { key: 'fgm_0_19', label: 'FG 0-19', defaultVal: 3 },
      { key: 'fgm_20_29', label: 'FG 20-29', defaultVal: 3 },
      { key: 'fgm_30_39', label: 'FG 30-39', defaultVal: 3 },
      { key: 'fgm_40_49', label: 'FG 40-49', defaultVal: 4 },
      { key: 'fgm_50p', label: 'FG 50+', defaultVal: 5 },
      { key: 'fgmiss', label: 'FG Miss', defaultVal: -1 },
      { key: 'xpm', label: 'XP Made', defaultVal: 1 },
      { key: 'xpmiss', label: 'XP Miss', defaultVal: -1 },
    ],
  },
  {
    title: 'Defense',
    fields: [
      { key: 'sack', label: 'Sack', defaultVal: 1 },
      { key: 'int', label: 'INT', defaultVal: 2 },
      { key: 'ff', label: 'Forced Fumble', defaultVal: 1 },
      { key: 'fum_rec', label: 'Fumble Rec', defaultVal: 1 },
      { key: 'def_td', label: 'Def TD', defaultVal: 6 },
      { key: 'safe', label: 'Safety', defaultVal: 2 },
      { key: 'blk_kick', label: 'Blocked Kick', defaultVal: 2 },
    ],
  },
  {
    title: 'Points Allowed',
    fields: [
      { key: 'pts_allow_0', label: '0 Pts Allowed', defaultVal: 10 },
      { key: 'pts_allow_1_6', label: '1-6 Pts', defaultVal: 7 },
      { key: 'pts_allow_7_13', label: '7-13 Pts', defaultVal: 4 },
      { key: 'pts_allow_14_20', label: '14-20 Pts', defaultVal: 1 },
      { key: 'pts_allow_21_27', label: '21-27 Pts', defaultVal: 0 },
      { key: 'pts_allow_28_34', label: '28-34 Pts', defaultVal: -1 },
      { key: 'pts_allow_35p', label: '35+ Pts', defaultVal: -4 },
    ],
  },
  {
    title: 'Special Teams',
    fields: [
      { key: 'st_td', label: 'ST TD', defaultVal: 6 },
      { key: 'st_ff', label: 'ST FF', defaultVal: 0 },
      { key: 'st_fum_rec', label: 'ST Fum Rec', defaultVal: 0 },
      { key: 'def_st_td', label: 'Def ST TD', defaultVal: 6 },
      { key: 'def_st_ff', label: 'Def ST FF', defaultVal: 0 },
      { key: 'def_st_fum_rec', label: 'Def ST Fum Rec', defaultVal: 0 },
    ],
  },
];

// Build default scoring lookup
const DEFAULT_SCORING: Record<string, number> = {};
for (const cat of SCORING_CATEGORIES) {
  for (const f of cat.fields) {
    DEFAULT_SCORING[f.key] = f.defaultVal;
  }
}

function countsToPositionArray(counts: Record<string, number>): RosterPosition[] {
  const arr: RosterPosition[] = [];
  for (const pos of ROSTER_POSITION_CONFIG) {
    const count = counts[pos.key] ?? 0;
    for (let i = 0; i < count; i++) {
      arr.push(pos.key);
    }
  }
  return arr;
}

export function CreateTab() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [name, setName] = useState('');
  const [totalRosters, setTotalRosters] = useState(12);
  const [leagueType, setLeagueType] = useState<LeagueType>(0);
  const [bestBall, setBestBall] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Roster positions as counts
  const [rosterCounts, setRosterCounts] = useState<Record<string, number>>({ ...DEFAULT_ROSTER_COUNTS });
  const [showRoster, setShowRoster] = useState(false);

  // Scoring settings
  const [scoring, setScoring] = useState<Record<string, number>>({ ...DEFAULT_SCORING });
  const [showScoring, setShowScoring] = useState(false);

  // Waiver settings
  const [showWaivers, setShowWaivers] = useState(false);
  const [waiverType, setWaiverType] = useState(2); // 0=Normal, 1=Rolling, 2=FAAB
  const [waiverBudget, setWaiverBudget] = useState(100);
  const [waiverBidMin, setWaiverBidMin] = useState(0);
  const [waiverDayOfWeek, setWaiverDayOfWeek] = useState(3); // Wednesday
  const [waiverClearDays, setWaiverClearDays] = useState(2);
  const [dailyWaivers, setDailyWaivers] = useState(false);
  const [dailyWaiversHour, setDailyWaiversHour] = useState(0);

  const updateRosterCount = (key: string, value: number) => {
    setRosterCounts((prev) => ({ ...prev, [key]: value }));
  };

  const updateScoring = (key: string, value: number) => {
    setScoring((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('League name is required');
      return;
    }
    if (!accessToken) {
      setError('Not authenticated');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      // Build roster_positions array
      const rosterPositions = countsToPositionArray(rosterCounts);

      // Build scoring_settings (only changed values)
      const scoringSettings: Record<string, number> = {};
      for (const [key, val] of Object.entries(scoring)) {
        if (val !== DEFAULT_SCORING[key]) {
          scoringSettings[key] = val;
        }
      }

      const result = await leagueApi.create(
        {
          name: name.trim(),
          season: CURRENT_SEASON,
          total_rosters: totalRosters,
          settings: {
            public: isPublic ? 1 : 0,
            type: leagueType,
            best_ball: bestBall ? 1 : 0,
            waiver_type: waiverType,
            waiver_budget: waiverBudget,
            waiver_bid_min: waiverBidMin,
            waiver_day_of_week: waiverDayOfWeek,
            waiver_clear_days: waiverClearDays,
            daily_waivers: dailyWaivers ? 1 : 0,
            daily_waivers_hour: dailyWaiversHour,
          },
          roster_positions: rosterPositions,
          ...(Object.keys(scoringSettings).length > 0 ? { scoring_settings: scoringSettings } : {}),
        },
        accessToken,
      );
      router.push(`/leagues/${result.league.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to create league');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = 'w-full rounded border border-input px-3 py-2 bg-muted text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring';
  const labelClass = 'mb-1 block text-sm font-medium text-accent-foreground';
  const numInputClass = 'w-16 rounded border border-input px-2 py-1.5 text-sm text-center bg-muted text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring';

  return (
    <div className="rounded-lg bg-card p-6 shadow">
      <h2 className="mb-4 text-lg font-semibold text-foreground">Create New League</h2>

      {error && (
        <div className="mb-4 rounded bg-destructive p-3 text-sm text-destructive-foreground">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="name" className={labelClass}>League Name</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="My League"
            disabled={isSubmitting}
            required
          />
        </div>

        <div className="mb-4">
          <label className={labelClass}>Season</label>
          <div className="rounded border border-border bg-surface px-3 py-2 text-sm text-accent-foreground">
            {CURRENT_SEASON}
          </div>
        </div>

        <div className="mb-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
              disabled={isSubmitting}
            />
            <span className="text-sm font-medium text-accent-foreground">Public league</span>
          </label>
          <p className="mt-1 ml-7 text-xs text-muted-foreground">
            Anyone can browse and join public leagues
          </p>
        </div>

        <div className="mb-4">
          <label htmlFor="totalRosters" className={labelClass}>Number of Teams</label>
          <select
            id="totalRosters"
            value={totalRosters}
            onChange={(e) => setTotalRosters(parseInt(e.target.value, 10))}
            className={inputClass}
            disabled={isSubmitting}
          >
            {[8, 10, 12, 14, 16].map((num) => (
              <option key={num} value={num}>{num}</option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label htmlFor="leagueType" className={labelClass}>League Type</label>
          <select
            id="leagueType"
            value={leagueType}
            onChange={(e) => setLeagueType(parseInt(e.target.value, 10) as LeagueType)}
            className={inputClass}
            disabled={isSubmitting}
          >
            <option value={0}>Redraft</option>
            <option value={2} disabled>Dynasty (Coming Soon)</option>
            <option value={1} disabled>Keeper (Coming Soon)</option>
          </select>
        </div>

        <div className="mb-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={bestBall}
              onChange={(e) => setBestBall(e.target.checked)}
              className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
              disabled={isSubmitting}
            />
            <span className="text-sm font-medium text-accent-foreground">Best Ball</span>
          </label>
          <p className="mt-1 ml-7 text-xs text-muted-foreground">
            Lineups are automatically optimized each week — no need to set starters
          </p>
        </div>

        {/* Roster Positions (collapsible) */}
        <div className="mb-4 rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setShowRoster(!showRoster)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-accent-foreground hover:bg-accent rounded-lg"
          >
            <span>Roster Positions</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${showRoster ? 'rotate-180' : ''}`} />
          </button>
          {showRoster && (
            <div className="border-t border-border px-4 py-3">
              <div className="grid grid-cols-2 gap-3">
                {ROSTER_POSITION_CONFIG.map((pos) => (
                  <div key={pos.key} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground truncate">{pos.label}</span>
                    <input
                      type="number"
                      value={rosterCounts[pos.key] ?? 0}
                      onChange={(e) => updateRosterCount(pos.key, Math.max(pos.min, Math.min(pos.max, parseInt(e.target.value) || 0)))}
                      min={pos.min}
                      max={pos.max}
                      className={numInputClass}
                      disabled={isSubmitting}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Scoring Settings (collapsible) */}
        <div className="mb-4 rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setShowScoring(!showScoring)}
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
                          onChange={(e) => updateScoring(f.key, parseFloat(e.target.value) || 0)}
                          className={numInputClass}
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

        {/* Waiver Settings (collapsible) */}
        <div className="mb-6 rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setShowWaivers(!showWaivers)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-accent-foreground hover:bg-accent rounded-lg"
          >
            <span>Waiver Settings</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${showWaivers ? 'rotate-180' : ''}`} />
          </button>
          {showWaivers && (
            <div className="border-t border-border px-4 py-3 space-y-4">
              <div>
                <label htmlFor="waiverType" className={labelClass}>Waiver Type</label>
                <select
                  id="waiverType"
                  value={waiverType}
                  onChange={(e) => setWaiverType(parseInt(e.target.value, 10))}
                  className={inputClass}
                  disabled={isSubmitting}
                >
                  <option value={2}>FAAB (Free Agent Auction Budget)</option>
                  <option value={0}>Normal (Reverse Standings)</option>
                  <option value={1}>Rolling Waivers</option>
                </select>
              </div>

              {waiverType === 2 && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="waiverBudget" className={labelClass}>FAAB Budget</label>
                    <input
                      id="waiverBudget"
                      type="number"
                      value={waiverBudget}
                      onChange={(e) => setWaiverBudget(Math.max(0, parseInt(e.target.value) || 0))}
                      min={0}
                      className={inputClass}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <label htmlFor="waiverBidMin" className={labelClass}>Min Bid</label>
                    <input
                      id="waiverBidMin"
                      type="number"
                      value={waiverBidMin}
                      onChange={(e) => setWaiverBidMin(Math.max(0, parseInt(e.target.value) || 0))}
                      min={0}
                      className={inputClass}
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="waiverDayOfWeek" className={labelClass}>Waiver Process Day</label>
                  <select
                    id="waiverDayOfWeek"
                    value={waiverDayOfWeek}
                    onChange={(e) => setWaiverDayOfWeek(parseInt(e.target.value, 10))}
                    className={inputClass}
                    disabled={isSubmitting}
                  >
                    <option value={0}>Sunday</option>
                    <option value={1}>Monday</option>
                    <option value={2}>Tuesday</option>
                    <option value={3}>Wednesday</option>
                    <option value={4}>Thursday</option>
                    <option value={5}>Friday</option>
                    <option value={6}>Saturday</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="waiverClearDays" className={labelClass}>Clear Period (Days)</label>
                  <input
                    id="waiverClearDays"
                    type="number"
                    value={waiverClearDays}
                    onChange={(e) => setWaiverClearDays(Math.max(0, Math.min(7, parseInt(e.target.value) || 0)))}
                    min={0}
                    max={7}
                    className={inputClass}
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={dailyWaivers}
                    onChange={(e) => setDailyWaivers(e.target.checked)}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                    disabled={isSubmitting}
                  />
                  <span className="text-sm font-medium text-accent-foreground">Daily Waivers</span>
                </label>
                <p className="mt-1 ml-7 text-xs text-muted-foreground">
                  Process waivers every day instead of once per week
                </p>
              </div>

              {dailyWaivers && (
                <div>
                  <label htmlFor="dailyWaiversHour" className={labelClass}>Daily Process Hour</label>
                  <select
                    id="dailyWaiversHour"
                    value={dailyWaiversHour}
                    onChange={(e) => setDailyWaiversHour(parseInt(e.target.value, 10))}
                    className={inputClass}
                    disabled={isSubmitting}
                  >
                    {[...Array(24)].map((_, h) => (
                      <option key={h} value={h}>
                        {h === 0 ? '12:00 AM' : h < 12 ? `${h}:00 AM` : h === 12 ? '12:00 PM' : `${h - 12}:00 PM`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="submit"
          className="w-full rounded bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Creating...' : 'Create League'}
        </button>
      </form>
    </div>
  );
}
