'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { leagueApi, ApiError } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { DEFAULT_ROSTER_COUNTS, countsToPositionArray } from '../config/roster-config';
import { DEFAULT_SCORING } from '../config/scoring-config';
import { LeagueSettingsForm } from './LeagueSettingsForm';
import type { LeagueFormValues } from './LeagueSettingsForm';

const CURRENT_SEASON = new Date().getFullYear().toString();

const DEFAULT_VALUES: LeagueFormValues = {
  name: '',
  totalRosters: 12,
  leagueType: 0,
  bestBall: false,
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
};

export function CreateTab() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [values, setValues] = useState<LeagueFormValues>({ ...DEFAULT_VALUES, rosterCounts: { ...DEFAULT_ROSTER_COUNTS }, scoring: { ...DEFAULT_SCORING } });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            waiver_type: values.waiverType,
            waiver_budget: values.waiverBudget,
            waiver_bid_min: values.waiverBidMin,
            waiver_day_of_week: values.waiverDayOfWeek,
            waiver_clear_days: values.waiverClearDays,
            daily_waivers: values.dailyWaivers ? 1 : 0,
            daily_waivers_hour: values.dailyWaiversHour,
            draft_setup: values.draftSetup,
            matchup_type: values.matchupType,
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

  return (
    <div className="rounded-lg bg-card p-6 shadow">
      <h2 className="mb-4 text-lg font-semibold text-foreground">Create New League</h2>

      {error && (
        <div className="mb-4 rounded bg-destructive p-3 text-sm text-destructive-foreground">{error}</div>
      )}

      <form onSubmit={handleSubmit}>
        <LeagueSettingsForm
          values={values}
          onChange={setValues}
          teamOptions={[8, 10, 12, 14, 16]}
          showSeason
          isSubmitting={isSubmitting}
        />

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
