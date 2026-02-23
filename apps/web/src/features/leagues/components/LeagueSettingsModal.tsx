'use client';

import { useState, useEffect } from 'react';
import { ApiError } from '@/lib/api';
import type { League, LeagueMember, Roster, UpdateLeagueRequest, LeagueStatus } from '@tbdff/shared';

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
  isOwner: boolean;
}

export function LeagueSettingsModal({
  isOpen, onClose, league, members, rosters, onUpdate, onDelete, onAssignRoster, onUnassignRoster, isOwner,
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
  const [rosterAssignments, setRosterAssignments] = useState<Record<number, string>>({});
  const [assigningRosterId, setAssigningRosterId] = useState<number | null>(null);
  const [isAssigningAll, setIsAssigningAll] = useState(false);

  // Reset form when league changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setName(league.name);
      setTotalRosters(league.total_rosters);
      setStatus(league.status);
      setIsPublic(league.settings?.public === 1);
      setMemberCanInvite(league.settings?.member_can_invite === 1);
      setError(null);
      setShowDeleteConfirmation(false);
      setIsDeleting(false);
      setRosterAssignments({});
      setAssigningRosterId(null);
    }
  }, [isOpen, league]);

  if (!isOpen) return null;

  const spectators = members.filter((m) => m.role === 'spectator');

  const getMemberUsername = (userId: string) => {
    const member = members.find((m) => m.user_id === userId);
    return member?.username ?? 'Unknown';
  };

  const handleAssign = async (rosterId: number) => {
    const userId = rosterAssignments[rosterId];
    if (!userId) return;

    try {
      setAssigningRosterId(rosterId);
      setError(null);
      await onAssignRoster(rosterId, userId);
      setRosterAssignments((prev) => {
        const next = { ...prev };
        delete next[rosterId];
        return next;
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to assign roster');
      }
    } finally {
      setAssigningRosterId(null);
    }
  };

  const handleUnassign = async (rosterId: number) => {
    try {
      setAssigningRosterId(rosterId);
      setError(null);
      await onUnassignRoster(rosterId);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to unassign roster');
      }
    } finally {
      setAssigningRosterId(null);
    }
  };

  const handleAssignAll = async () => {
    const openRosters = rosters
      .slice()
      .sort((a, b) => a.roster_id - b.roster_id)
      .filter((r) => !r.owner_id);
    const availableSpectators = [...spectators];

    if (openRosters.length === 0 || availableSpectators.length === 0) return;

    setIsAssigningAll(true);
    setError(null);

    for (const roster of openRosters) {
      const spectator = availableSpectators.shift();
      if (!spectator) break;

      try {
        await onAssignRoster(roster.roster_id, spectator.user_id);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('Failed to assign roster');
        }
        break;
      }
    }

    setIsAssigningAll(false);
  };

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
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-xl font-bold text-gray-900">League Settings</h2>

        {error && (
          <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">
              League Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="My League"
              disabled={isSubmitting}
              maxLength={100}
            />
          </div>

          <div className="mb-4">
            <label htmlFor="totalRosters" className="mb-1 block text-sm font-medium text-gray-700">
              Number of Teams
            </label>
            <select
              id="totalRosters"
              value={totalRosters}
              onChange={(e) => setTotalRosters(parseInt(e.target.value, 10))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
            <label htmlFor="status" className="mb-1 block text-sm font-medium text-gray-700">
              League Status
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as LeagueStatus)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={isSubmitting}
            >
              <option value="pre_draft">Pre-Draft</option>
              <option value="drafting">Drafting</option>
              <option value="in_season">In Season</option>
              <option value="complete">Complete</option>
            </select>
          </div>

          <div className="mb-4">
            <label htmlFor="visibility" className="mb-1 block text-sm font-medium text-gray-700">
              League Visibility
            </label>
            <select
              id="visibility"
              value={isPublic ? 'public' : 'private'}
              onChange={(e) => setIsPublic(e.target.value === 'public')}
              className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={isSubmitting}
            >
              <option value="public">Public - Anyone can find and join</option>
              <option value="private">Private - Invite only</option>
            </select>
          </div>

          {!isPublic && (
            <div className="mb-4">
              <label htmlFor="invitePermission" className="mb-1 block text-sm font-medium text-gray-700">
                Who can send invites?
              </label>
              <select
                id="invitePermission"
                value={memberCanInvite ? 'anyone' : 'commissioner'}
                onChange={(e) => setMemberCanInvite(e.target.value === 'anyone')}
                className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                disabled={isSubmitting}
              >
                <option value="commissioner">Commissioner only</option>
                <option value="anyone">All members</option>
              </select>
            </div>
          )}

          {/* Roster Assignments - Commissioner only */}
          {isOwner && (
            <div className="mb-4 border-t border-gray-200 pt-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Roster Assignments</h3>
                {spectators.length > 0 && rosters.some((r) => !r.owner_id) && (
                  <button
                    type="button"
                    onClick={handleAssignAll}
                    disabled={isAssigningAll || assigningRosterId !== null}
                    className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {isAssigningAll ? 'Assigning...' : `Assign All (${spectators.length})`}
                  </button>
                )}
              </div>
              {spectators.length > 0 && (
                <p className="mb-2 text-xs text-gray-500">
                  {spectators.length} spectator{spectators.length !== 1 ? 's' : ''} waiting for roster assignment
                </p>
              )}
              <div className="space-y-2">
                {rosters
                  .slice()
                  .sort((a, b) => a.roster_id - b.roster_id)
                  .map((roster) => {
                    const isCommissionerRoster = roster.owner_id && members.find((m) => m.user_id === roster.owner_id)?.role === 'commissioner';
                    return (
                      <div
                        key={roster.roster_id}
                        className="flex items-center gap-2 rounded border border-gray-300 bg-gray-50 p-2"
                      >
                        <span className="w-16 shrink-0 text-xs font-bold text-gray-700">
                          Roster {roster.roster_id}
                        </span>
                        {roster.owner_id ? (
                          <div className="flex flex-1 items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">
                              {getMemberUsername(roster.owner_id)}
                            </span>
                            {!isCommissionerRoster && (
                              <button
                                type="button"
                                onClick={() => handleUnassign(roster.roster_id)}
                                disabled={assigningRosterId === roster.roster_id || isAssigningAll}
                                className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                              >
                                {assigningRosterId === roster.roster_id ? '...' : 'Unassign'}
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-1 items-center gap-2">
                            <select
                              value={rosterAssignments[roster.roster_id] || ''}
                              onChange={(e) =>
                                setRosterAssignments((prev) => ({
                                  ...prev,
                                  [roster.roster_id]: e.target.value,
                                }))
                              }
                              className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                              disabled={assigningRosterId === roster.roster_id || isAssigningAll}
                            >
                              <option value="">Select spectator...</option>
                              {spectators.map((s) => (
                                <option key={s.user_id} value={s.user_id}>
                                  {s.username}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => handleAssign(roster.roster_id)}
                              disabled={!rosterAssignments[roster.roster_id] || assigningRosterId === roster.roster_id || isAssigningAll}
                              className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              {assigningRosterId === roster.roster_id ? '...' : 'Assign'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {isOwner && (
            <div className="mb-6 border-t border-gray-300 pt-6">
              <h3 className="mb-2 text-sm font-semibold text-red-600">Danger Zone</h3>

              {!showDeleteConfirmation ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirmation(true)}
                  className="w-full rounded border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  disabled={isSubmitting || isDeleting}
                >
                  Delete League
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="rounded bg-red-50 p-3 text-sm text-red-800">
                    <p className="font-medium">Are you sure you want to delete this league?</p>
                    <p className="mt-1">This action cannot be undone. All league data will be permanently deleted.</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirmation(false)}
                      className="flex-1 rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      disabled={isDeleting}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="flex-1 rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
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
              className="flex-1 rounded bg-gray-200 px-4 py-2 font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
              disabled={isSubmitting || isDeleting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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
