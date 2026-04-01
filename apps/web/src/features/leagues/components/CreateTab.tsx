'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { leagueApi, ApiError } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { DEFAULT_ROSTER_COUNTS, countsToPositionArray } from '../config/roster-config';
import { DEFAULT_SCORING } from '../config/scoring-config';
import { LeagueSettingsForm } from './LeagueSettingsForm';
import type { LeagueFormValues } from './LeagueSettingsForm';
import { PaymentsSettings } from './PaymentsSettings';
import { TEAM_OPTIONS } from './LeagueSettingsModal';

const CURRENT_SEASON = new Date().getFullYear().toString();

const DEFAULT_VALUES: LeagueFormValues = {
  name: '',
  totalRosters: 12,
  leagueType: 0,
  bestBall: false,
  disableTrades: false,
  isPublic: false,
  memberCanInvite: false,
  rosterCounts: { ...DEFAULT_ROSTER_COUNTS },
  scoring: { ...DEFAULT_SCORING },
  waiverType: 2,
  waiverBudget: 100,
  waiverBidMin: 0,
  waiverDayOfWeek: 3,
  waiverClearDays: 2,
  dailyWaivers: false,
  dailyWaiversHour: 0,
  draftSetup: 0,
  matchupType: 0,
  buyIn: 0,
  payouts: [],
};

export function CreateTab() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [values, setValues] = useState<LeagueFormValues>({
    ...DEFAULT_VALUES,
    rosterCounts: { ...DEFAULT_ROSTER_COUNTS },
    scoring: { ...DEFAULT_SCORING },
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPayments, setShowPayments] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.name.trim()) {
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

      const rosterPositions = countsToPositionArray(values.rosterCounts);

      // Only send changed scoring values
      const scoringSettings: Record<string, number> = {};
      for (const [key, val] of Object.entries(values.scoring)) {
        if (val !== DEFAULT_SCORING[key]) {
          scoringSettings[key] = val;
        }
      }

      const result = await leagueApi.create(
        {
          name: values.name.trim(),
          season: CURRENT_SEASON,
          total_rosters: values.totalRosters,
          settings: {
            public: values.isPublic ? 1 : 0,
            type: values.leagueType,
            best_ball: values.bestBall ? 1 : 0,
            disable_trades: values.disableTrades ? 1 : 0,
            waiver_type: values.waiverType,
            waiver_budget: values.waiverBudget,
            waiver_bid_min: values.waiverBidMin,
            waiver_day_of_week: values.waiverDayOfWeek,
            waiver_clear_days: values.waiverClearDays,
            daily_waivers: values.dailyWaivers ? 1 : 0,
            daily_waivers_hour: values.dailyWaiversHour,
            draft_setup: values.draftSetup,
            matchup_type: values.matchupType,
            ...(values.buyIn > 0 ? { buy_in: values.buyIn } : {}),
            ...(values.payouts.length > 0 ? { payouts: values.payouts } : {}),
          } as any,
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

  return (
    <div className="rounded-lg bg-card p-6 shadow">
      <h2 className="mb-6 text-xl font-bold text-foreground font-heading">Create New League</h2>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive p-3 text-sm text-destructive-foreground">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <LeagueSettingsForm
          values={values}
          onChange={setValues}
          teamOptions={TEAM_OPTIONS}
          showSeason
          isSubmitting={isSubmitting}
        >
          <PaymentsSettings
            mode="create"
            buyIn={values.buyIn}
            totalRosters={values.totalRosters}
            onBuyInChange={(v) => setValues({ ...values, buyIn: v })}
            payouts={values.payouts}
            onPayoutsChange={(p) => setValues({ ...values, payouts: p })}
            isOpen={showPayments}
            onToggle={() => setShowPayments(!showPayments)}
          />
        </LeagueSettingsForm>

        <div className="sticky bottom-0 left-0 right-0 mt-6 -mx-6 -mb-6 border-t border-border bg-card/95 backdrop-blur-sm px-6 py-4">
          <button
            type="submit"
            className="w-full rounded-lg bg-primary px-4 py-3 text-base font-bold text-primary-foreground hover:bg-primary-hover disabled:opacity-50 transition-colors shadow-lg glow-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creating...' : 'Create League'}
          </button>
        </div>
      </form>
    </div>
  );
}
