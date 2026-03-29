'use client';

import { useState, useEffect } from 'react';
import { ApiError } from '@/lib/api';
import type { League, LeagueMember, UpdateLeagueRequest } from '@tbdff/shared';
import { countsToPositionArray } from '../config/roster-config';
import { scoringFromLeague } from '../config/scoring-config';
import { LeagueSettingsForm, leagueToFormValues } from './LeagueSettingsForm';
import type { LeagueFormValues } from './LeagueSettingsForm';
import { PaymentsSettings } from './PaymentsSettings';

const TEAM_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 2); // 2..32

interface LeagueSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  league: League;
  members: LeagueMember[];
  onUpdate: (data: UpdateLeagueRequest) => Promise<void>;
  onDelete: () => Promise<void>;
  onLeagueRefresh: () => void;
  isOwner: boolean;
}

export function LeagueSettingsModal({
  isOpen, onClose, league, members, onUpdate, onDelete, onLeagueRefresh, isOwner,
}: LeagueSettingsModalProps) {
  const [values, setValues] = useState<LeagueFormValues>(() => leagueToFormValues(league));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPayments, setShowPayments] = useState(false);

  // Reset form when league changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setValues(leagueToFormValues(league));
      setShowPayments(false);
      setError(null);
      setShowDeleteConfirmation(false);
      setIsDeleting(false);
    }
  }, [isOpen, league]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Build update object with only changed fields
    const updates: UpdateLeagueRequest = {};
    if (values.name.trim() !== league.name) {
      if (!values.name.trim()) {
        setError('League name cannot be empty');
        return;
      }
      if (values.name.trim().length > 100) {
        setError('League name must be 100 characters or less');
        return;
      }
      updates.name = values.name.trim();
    }
    if (values.totalRosters !== league.total_rosters) {
      if (values.totalRosters < 2 || values.totalRosters > 32) {
        setError('Total rosters must be between 2 and 32');
        return;
      }
      updates.total_rosters = values.totalRosters;
    }

    const currentIsPublic = league.settings?.public === 1;
    const currentMemberCanInvite = league.settings?.member_can_invite === 1;
    const currentLeagueType = (league.settings?.type ?? 0);
    const currentBestBall = league.settings?.best_ball === 1;
    const currentDisableTrades = league.settings?.disable_trades === 1;
    const currentWaiverType = league.settings?.waiver_type ?? 2;
    const currentWaiverBudget = league.settings?.waiver_budget ?? 100;
    const currentWaiverBidMin = league.settings?.waiver_bid_min ?? 0;
    const currentWaiverDayOfWeek = league.settings?.waiver_day_of_week ?? 3;
    const currentWaiverClearDays = league.settings?.waiver_clear_days ?? 2;
    const currentDailyWaivers = league.settings?.daily_waivers === 1;
    const currentDailyWaiversHour = league.settings?.daily_waivers_hour ?? 0;
    const currentDraftSetup = league.settings?.draft_setup ?? 0;
    const currentMatchupType = league.settings?.matchup_type ?? 0;
    if (
      values.isPublic !== currentIsPublic || values.memberCanInvite !== currentMemberCanInvite ||
      values.leagueType !== currentLeagueType || values.bestBall !== currentBestBall ||
      values.disableTrades !== currentDisableTrades ||
      values.waiverType !== currentWaiverType || values.waiverBudget !== currentWaiverBudget ||
      values.waiverBidMin !== currentWaiverBidMin || values.waiverDayOfWeek !== currentWaiverDayOfWeek ||
      values.waiverClearDays !== currentWaiverClearDays || values.dailyWaivers !== currentDailyWaivers ||
      values.dailyWaiversHour !== currentDailyWaiversHour ||
      values.draftSetup !== currentDraftSetup ||
      values.matchupType !== currentMatchupType
    ) {
      updates.settings = {
        public: values.isPublic ? 1 : 0,
        member_can_invite: values.memberCanInvite ? 1 : 0,
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
      };
    }

    // Check roster positions
    const newPositions = countsToPositionArray(values.rosterCounts);
    const oldPositions = league.roster_positions ?? [];
    if (JSON.stringify(newPositions) !== JSON.stringify(oldPositions)) {
      updates.roster_positions = newPositions;
    }

    // Check scoring settings (only changed values)
    const originalScoring = scoringFromLeague(league);
    const scoringChanges: Record<string, number> = {};
    for (const [key, val] of Object.entries(values.scoring)) {
      if (val !== originalScoring[key]) {
        scoringChanges[key] = val;
      }
    }
    if (Object.keys(scoringChanges).length > 0) {
      updates.scoring_settings = scoringChanges;
    }

    // Skip if no changes
    if (Object.keys(updates).length === 0) {
      onClose();
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onUpdate(updates);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to update league settings');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      setError(null);
      await onDelete();
    } catch (err) {
      setShowDeleteConfirmation(false);
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to delete league');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-card p-6 shadow-xl glass-strong">
        <h2 className="mb-4 text-xl font-bold text-foreground font-heading">League Settings</h2>

        {error && (
          <div className="mb-4 rounded bg-destructive p-3 text-sm text-destructive-foreground">{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <LeagueSettingsForm
            values={values}
            onChange={setValues}
            teamOptions={TEAM_OPTIONS}
            showMemberCanInvite
            isSubmitting={isSubmitting}
          >
            {isOwner && (
              <PaymentsSettings
                leagueId={league.id}
                members={members}
                totalRosters={league.total_rosters}
                settings={league.settings}
                isOpen={showPayments}
                onToggle={() => setShowPayments(!showPayments)}
                onSettingsUpdate={onLeagueRefresh}
              />
            )}

            {isOwner && (
              <div className="mb-6 border-t border-input pt-6">
                <h3 className="mb-2 text-sm font-semibold text-destructive-foreground">Danger Zone</h3>

                {!showDeleteConfirmation ? (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirmation(true)}
                    className="w-full rounded border border-destructive-foreground/30 bg-card px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive disabled:opacity-50"
                    disabled={isSubmitting || isDeleting}
                  >
                    Delete League
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded bg-destructive p-3 text-sm text-destructive-foreground">
                      <p className="font-medium">Are you sure you want to delete this league?</p>
                      <p className="mt-1">This action cannot be undone. All league data will be permanently deleted.</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirmation(false)}
                        className="flex-1 rounded border border-input bg-card px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent disabled:opacity-50"
                        disabled={isDeleting}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleDelete}
                        className="flex-1 rounded bg-red-600 px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-red-700 disabled:opacity-50"
                        disabled={isDeleting}
                      >
                        {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </LeagueSettingsForm>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded bg-muted-hover px-4 py-2 font-medium text-accent-foreground hover:bg-muted-hover disabled:opacity-50"
              disabled={isSubmitting || isDeleting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
              disabled={isSubmitting || isDeleting}
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
