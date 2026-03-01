'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api';
import type { LeagueMember, Roster } from '@tbdff/shared';

interface RosterAssignmentsProps {
  rosters: Roster[];
  members: LeagueMember[];
  onAssignRoster: (rosterId: number, userId: string) => Promise<void>;
  onUnassignRoster: (rosterId: number) => Promise<void>;
  onError: (message: string) => void;
}

export function RosterAssignments({
  rosters,
  members,
  onAssignRoster,
  onUnassignRoster,
  onError,
}: RosterAssignmentsProps) {
  const [rosterAssignments, setRosterAssignments] = useState<Record<number, string>>({});
  const [assigningRosterId, setAssigningRosterId] = useState<number | null>(null);
  const [isAssigningAll, setIsAssigningAll] = useState(false);

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
      await onAssignRoster(rosterId, userId);
      setRosterAssignments((prev) => {
        const next = { ...prev };
        delete next[rosterId];
        return next;
      });
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Failed to assign roster');
    } finally {
      setAssigningRosterId(null);
    }
  };

  const handleUnassign = async (rosterId: number) => {
    try {
      setAssigningRosterId(rosterId);
      await onUnassignRoster(rosterId);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Failed to unassign roster');
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

    for (const roster of openRosters) {
      const spectator = availableSpectators.shift();
      if (!spectator) break;

      try {
        await onAssignRoster(roster.roster_id, spectator.user_id);
      } catch (err) {
        onError(err instanceof ApiError ? err.message : 'Failed to assign roster');
        break;
      }
    }

    setIsAssigningAll(false);
  };

  return (
    <div className="mb-4 border-t border-border pt-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Roster Assignments</h3>
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
        <p className="mb-2 text-xs text-muted-foreground">
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
                className="flex items-center gap-2 rounded border border-input bg-surface p-2"
              >
                <span className="w-16 shrink-0 text-xs font-bold text-accent-foreground">
                  Roster {roster.roster_id}
                </span>
                {roster.owner_id ? (
                  <div className="flex flex-1 items-center justify-between">
                    <span className="text-sm font-medium text-foreground">
                      {getMemberUsername(roster.owner_id)}
                    </span>
                    {!isCommissionerRoster && (
                      <button
                        type="button"
                        onClick={() => handleUnassign(roster.roster_id)}
                        disabled={assigningRosterId === roster.roster_id || isAssigningAll}
                        className="rounded px-2 py-1 text-xs text-destructive-foreground hover:bg-destructive disabled:opacity-50"
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
                      className="flex-1 rounded border border-input bg-card px-2 py-1 text-sm text-foreground focus:border-ring focus:outline-none"
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
                      className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
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
  );
}
