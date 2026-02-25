'use client';

import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { ApiError } from '@/lib/api';
import type { League, LeagueMember, Roster, UpdateLeagueRequest, LeagueStatus, RosterPosition } from '@tbdff/shared';

// Roster position config
const ROSTER_POSITION_CONFIG: { key: RosterPosition; label: string; min: number; max: number }[] = [
  { key: 'QB', label: 'QB', min: 0, max: 5 },
  { key: 'RB', label: 'RB', min: 0, max: 8 },
  { key: 'WR', label: 'WR', min: 0, max: 8 },
  { key: 'TE', label: 'TE', min: 0, max: 5 },
  { key: 'FLEX', label: 'FLEX (RB/WR/TE)', min: 0, max: 8 },
  { key: 'SUPER_FLEX', label: 'SUPER FLEX (QB/RB/WR/TE)', min: 0, max: 5 },
  { key: 'REC_FLEX', label: 'REC FLEX (WR/TE)', min: 0, max: 5 },
  { key: 'WRRB_FLEX', label: 'WRRB FLEX (WR/RB)', min: 0, max: 5 },
  { key: 'K', label: 'K', min: 0, max: 3 },
  { key: 'DEF', label: 'DEF', min: 0, max: 3 },
  { key: 'BN', label: 'Bench', min: 0, max: 15 },
  { key: 'IR', label: 'IR', min: 0, max: 5 },
];

// Scoring categories config
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

function positionArrayToCounts(positions: RosterPosition[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const pos of ROSTER_POSITION_CONFIG) {
    counts[pos.key] = 0;
  }
  for (const pos of positions) {
    counts[pos] = (counts[pos] ?? 0) + 1;
  }
  return counts;
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

function scoringFromLeague(league: League): Record<string, number> {
  const result: Record<string, number> = {};
  for (const cat of SCORING_CATEGORIES) {
    for (const f of cat.fields) {
      result[f.key] = league.scoring_settings?.[f.key] ?? f.defaultVal;
    }
  }
  return result;
}

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

  // Roster positions and scoring
  const [rosterCounts, setRosterCounts] = useState<Record<string, number>>(() => positionArrayToCounts(league.roster_positions ?? []));
  const [showRoster, setShowRoster] = useState(false);
  const [scoring, setScoring] = useState<Record<string, number>>(() => scoringFromLeague(league));
  const [showScoring, setShowScoring] = useState(false);

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
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl">
        <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">League Settings</h2>

        {error && (
          <div className="mb-4 rounded bg-red-50 dark:bg-red-900/30 p-3 text-sm text-red-600 dark:text-red-400">{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              League Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white dark:bg-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="My League"
              disabled={isSubmitting}
              maxLength={100}
            />
          </div>

          <div className="mb-4">
            <label htmlFor="totalRosters" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Number of Teams
            </label>
            <select
              id="totalRosters"
              value={totalRosters}
              onChange={(e) => setTotalRosters(parseInt(e.target.value, 10))}
              className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white dark:bg-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
            <label htmlFor="status" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              League Status
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as LeagueStatus)}
              className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white dark:bg-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={isSubmitting}
            >
              <option value="pre_draft">Pre-Draft</option>
              <option value="drafting">Drafting</option>
              <option value="in_season">In Season</option>
              <option value="complete">Complete</option>
            </select>
          </div>

          <div className="mb-4">
            <label htmlFor="visibility" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              League Visibility
            </label>
            <select
              id="visibility"
              value={isPublic ? 'public' : 'private'}
              onChange={(e) => setIsPublic(e.target.value === 'public')}
              className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white dark:bg-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={isSubmitting}
            >
              <option value="public">Public - Anyone can find and join</option>
              <option value="private">Private - Invite only</option>
            </select>
          </div>

          {!isPublic && (
            <div className="mb-4">
              <label htmlFor="invitePermission" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Who can send invites?
              </label>
              <select
                id="invitePermission"
                value={memberCanInvite ? 'anyone' : 'commissioner'}
                onChange={(e) => setMemberCanInvite(e.target.value === 'anyone')}
                className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white dark:bg-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                disabled={isSubmitting}
              >
                <option value="commissioner">Commissioner only</option>
                <option value="anyone">All members</option>
              </select>
            </div>
          )}

          {/* Roster Positions (collapsible) */}
          <div className="mb-4 rounded-lg border border-gray-200 dark:border-gray-600">
            <button
              type="button"
              onClick={() => setShowRoster(!showRoster)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg"
            >
              <span>Roster Positions</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showRoster ? 'rotate-180' : ''}`} />
            </button>
            {showRoster && (
              <div className="border-t border-gray-200 dark:border-gray-600 px-4 py-3">
                <div className="grid grid-cols-2 gap-3">
                  {ROSTER_POSITION_CONFIG.map((pos) => (
                    <div key={pos.key} className="flex items-center justify-between gap-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400 truncate">{pos.label}</span>
                      <input
                        type="number"
                        value={rosterCounts[pos.key] ?? 0}
                        onChange={(e) => setRosterCounts((prev) => ({ ...prev, [pos.key]: Math.max(pos.min, Math.min(pos.max, parseInt(e.target.value) || 0)) }))}
                        min={pos.min}
                        max={pos.max}
                        className="w-16 rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm text-center dark:bg-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        disabled={isSubmitting}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Scoring Settings (collapsible) */}
          <div className="mb-4 rounded-lg border border-gray-200 dark:border-gray-600">
            <button
              type="button"
              onClick={() => setShowScoring(!showScoring)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg"
            >
              <span>Scoring Settings</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showScoring ? 'rotate-180' : ''}`} />
            </button>
            {showScoring && (
              <div className="border-t border-gray-200 dark:border-gray-600 px-4 py-3 space-y-4">
                {SCORING_CATEGORIES.map((cat) => (
                  <div key={cat.title}>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {cat.title}
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {cat.fields.map((f) => (
                        <div key={f.key} className="flex items-center justify-between gap-2">
                          <span className="text-sm text-gray-600 dark:text-gray-400 truncate">{f.label}</span>
                          <input
                            type="number"
                            step="any"
                            value={scoring[f.key] ?? f.defaultVal}
                            onChange={(e) => setScoring((prev) => ({ ...prev, [f.key]: parseFloat(e.target.value) || 0 }))}
                            className="w-16 rounded border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm text-center dark:bg-gray-700 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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

          {/* Roster Assignments - Commissioner only */}
          {isOwner && (
            <div className="mb-4 border-t border-gray-200 dark:border-gray-700 pt-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Roster Assignments</h3>
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
                <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
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
                        className="flex items-center gap-2 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 p-2"
                      >
                        <span className="w-16 shrink-0 text-xs font-bold text-gray-700 dark:text-gray-300">
                          Roster {roster.roster_id}
                        </span>
                        {roster.owner_id ? (
                          <div className="flex flex-1 items-center justify-between">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {getMemberUsername(roster.owner_id)}
                            </span>
                            {!isCommissionerRoster && (
                              <button
                                type="button"
                                onClick={() => handleUnassign(roster.roster_id)}
                                disabled={assigningRosterId === roster.roster_id || isAssigningAll}
                                className="rounded px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
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
                              className="flex-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none"
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
            <div className="mb-6 border-t border-gray-300 dark:border-gray-600 pt-6">
              <h3 className="mb-2 text-sm font-semibold text-red-600 dark:text-red-400">Danger Zone</h3>

              {!showDeleteConfirmation ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirmation(true)}
                  className="w-full rounded border border-red-300 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
                  disabled={isSubmitting || isDeleting}
                >
                  Delete League
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="rounded bg-red-50 dark:bg-red-900/30 p-3 text-sm text-red-800 dark:text-red-300">
                    <p className="font-medium">Are you sure you want to delete this league?</p>
                    <p className="mt-1">This action cannot be undone. All league data will be permanently deleted.</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirmation(false)}
                      className="flex-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
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
              className="flex-1 rounded bg-gray-200 dark:bg-gray-700 px-4 py-2 font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
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
