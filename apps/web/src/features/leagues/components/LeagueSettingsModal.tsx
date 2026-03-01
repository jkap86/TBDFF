'use client';

import { useState, useEffect } from 'react';
import { ApiError } from '@/lib/api';
import type { League, LeagueMember, Roster, UpdateLeagueRequest, LeagueStatus } from '@tbdff/shared';
import { positionArrayToCounts, countsToPositionArray } from '../config/roster-config';
import { scoringFromLeague } from '../config/scoring-config';
import { RosterPositionsEditor } from './RosterPositionsEditor';
import { ScoringSettingsEditor } from './ScoringSettingsEditor';
import { RosterAssignments } from './RosterAssignments';
import { PaymentsSettings } from './PaymentsSettings';

interface LeagueSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  league: League;
  members: LeagueMember[];
  rosters: Roster[];
  onUpdate: (data: UpdateLeagueRequest) => Promise<void>;
  onDelete: () => Promise<void>;
  onAssignRoster: (rosterId: number, userId: string) => Promise<void>;
  onUnassignRoster: (rosterId: number) => Promise<void>;
  onLeagueRefresh: () => void;
  isOwner: boolean;
}

export function LeagueSettingsModal({
  isOpen, onClose, league, members, rosters, onUpdate, onDelete, onAssignRoster, onUnassignRoster, onLeagueRefresh, isOwner,
}: LeagueSettingsModalProps) {
  const [name, setName] = useState(league.name);
  const [totalRosters, setTotalRosters] = useState(league.total_rosters);
  const [status, setStatus] = useState<LeagueStatus>(league.status);
  const [isPublic, setIsPublic] = useState(league.settings?.public === 1);
  const [memberCanInvite, setMemberCanInvite] = useState(league.settings?.member_can_invite === 1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Roster positions and scoring
  const [rosterCounts, setRosterCounts] = useState<Record<string, number>>(() => positionArrayToCounts(league.roster_positions ?? []));
  const [showRoster, setShowRoster] = useState(false);
  const [scoring, setScoring] = useState<Record<string, number>>(() => scoringFromLeague(league));
  const [showScoring, setShowScoring] = useState(false);
  const [showPayments, setShowPayments] = useState(false);

  // Reset form when league changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setName(league.name);
      setTotalRosters(league.total_rosters);
      setStatus(league.status);
      setIsPublic(league.settings?.public === 1);
      setMemberCanInvite(league.settings?.member_can_invite === 1);
      setRosterCounts(positionArrayToCounts(league.roster_positions ?? []));
      setShowRoster(false);
      setScoring(scoringFromLeague(league));
      setShowScoring(false);
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
    if (name.trim() !== league.name) {
      if (!name.trim()) {
        setError('League name cannot be empty');
        return;
      }
      if (name.trim().length > 100) {
        setError('League name must be 100 characters or less');
        return;
      }
      updates.name = name.trim();
    }
    if (totalRosters !== league.total_rosters) {
      if (totalRosters < 2 || totalRosters > 32) {
        setError('Total rosters must be between 2 and 32');
        return;
      }
      updates.total_rosters = totalRosters;
    }
    if (status !== league.status) {
      updates.status = status;
    }
    const currentIsPublic = league.settings?.public === 1;
    const currentMemberCanInvite = league.settings?.member_can_invite === 1;
    if (isPublic !== currentIsPublic || memberCanInvite !== currentMemberCanInvite) {
      updates.settings = {
        public: isPublic ? 1 : 0,
        member_can_invite: memberCanInvite ? 1 : 0,
      };
    }

    // Check roster positions
    const newPositions = countsToPositionArray(rosterCounts);
    const oldPositions = league.roster_positions ?? [];
    if (JSON.stringify(newPositions) !== JSON.stringify(oldPositions)) {
      updates.roster_positions = newPositions;
    }

    // Check scoring settings (only changed values)
    const originalScoring = scoringFromLeague(league);
    const scoringChanges: Record<string, number> = {};
    for (const [key, val] of Object.entries(scoring)) {
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
      // Modal will close when parent navigates away
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-card p-6 shadow-xl">
        <h2 className="mb-4 text-xl font-bold text-foreground">League Settings</h2>

        {error && (
          <div className="mb-4 rounded bg-destructive p-3 text-sm text-destructive-foreground">{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-accent-foreground">
              League Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-input px-3 py-2 text-foreground bg-muted focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="My League"
              disabled={isSubmitting}
              maxLength={100}
            />
          </div>

          <div className="mb-4">
            <label htmlFor="totalRosters" className="mb-1 block text-sm font-medium text-accent-foreground">
              Number of Teams
            </label>
            <select
              id="totalRosters"
              value={totalRosters}
              onChange={(e) => setTotalRosters(parseInt(e.target.value, 10))}
              className="w-full rounded border border-input px-3 py-2 text-foreground bg-muted focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              disabled={isSubmitting}
            >
              {[...Array(31)].map((_, i) => {
                const num = i + 2; // 2 to 32
                return (
                  <option key={num} value={num}>
                    {num}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="mb-4">
            <label htmlFor="status" className="mb-1 block text-sm font-medium text-accent-foreground">
              League Status
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as LeagueStatus)}
              className="w-full rounded border border-input px-3 py-2 text-foreground bg-muted focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              disabled={isSubmitting}
            >
              <option value="pre_draft">Pre-Draft</option>
              <option value="drafting">Drafting</option>
              <option value="in_season">In Season</option>
              <option value="complete">Complete</option>
            </select>
          </div>

          <div className="mb-4">
            <label htmlFor="visibility" className="mb-1 block text-sm font-medium text-accent-foreground">
              League Visibility
            </label>
            <select
              id="visibility"
              value={isPublic ? 'public' : 'private'}
              onChange={(e) => setIsPublic(e.target.value === 'public')}
              className="w-full rounded border border-input px-3 py-2 text-foreground bg-muted focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              disabled={isSubmitting}
            >
              <option value="public">Public - Anyone can find and join</option>
              <option value="private">Private - Invite only</option>
            </select>
          </div>

          {!isPublic && (
            <div className="mb-4">
              <label htmlFor="invitePermission" className="mb-1 block text-sm font-medium text-accent-foreground">
                Who can send invites?
              </label>
              <select
                id="invitePermission"
                value={memberCanInvite ? 'anyone' : 'commissioner'}
                onChange={(e) => setMemberCanInvite(e.target.value === 'anyone')}
                className="w-full rounded border border-input px-3 py-2 text-foreground bg-muted focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                disabled={isSubmitting}
              >
                <option value="commissioner">Commissioner only</option>
                <option value="anyone">All members</option>
              </select>
            </div>
          )}

          <RosterPositionsEditor
            rosterCounts={rosterCounts}
            onCountChange={(key, value) => setRosterCounts((prev) => ({ ...prev, [key]: value }))}
            showRoster={showRoster}
            onToggle={() => setShowRoster(!showRoster)}
            isSubmitting={isSubmitting}
          />

          <ScoringSettingsEditor
            scoring={scoring}
            onScoringChange={(key, value) => setScoring((prev) => ({ ...prev, [key]: value }))}
            showScoring={showScoring}
            onToggle={() => setShowScoring(!showScoring)}
            isSubmitting={isSubmitting}
          />

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
            <RosterAssignments
              rosters={rosters}
              members={members}
              onAssignRoster={onAssignRoster}
              onUnassignRoster={onUnassignRoster}
              onError={setError}
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
