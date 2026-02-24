'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { leagueApi, ApiError } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import type { LeagueInvite } from '@/lib/api';

export function InvitesTab() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [invites, setInvites] = useState<LeagueInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchInvites = useCallback(async () => {
    if (!accessToken) return;

    try {
      setIsLoading(true);
      setError(null);
      const result = await leagueApi.getMyInvites(accessToken);
      setInvites(result.invites);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to load invites');
      }
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  const handleAccept = async (inviteId: string, leagueId: string) => {
    if (!accessToken) return;

    try {
      setActionId(inviteId);
      setError(null);
      await leagueApi.acceptInvite(inviteId, accessToken);
      router.push(`/leagues/${leagueId}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to accept invite');
      }
    } finally {
      setActionId(null);
    }
  };

  const handleDecline = async (inviteId: string) => {
    if (!accessToken) return;

    try {
      setActionId(inviteId);
      setError(null);
      await leagueApi.declineInvite(inviteId, accessToken);
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to decline invite');
      }
    } finally {
      setActionId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow">
        <p className="text-center text-gray-500 dark:text-gray-400">Loading invites...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded bg-red-50 dark:bg-red-900/30 p-3 text-sm text-red-600 dark:text-red-400">{error}</div>
      )}

      {invites.length === 0 ? (
        <div className="rounded-lg bg-white dark:bg-gray-800 p-8 text-center shadow">
          <p className="text-gray-500 dark:text-gray-400">No pending invites.</p>
        </div>
      ) : (
        invites.map((invite) => (
          <div
            key={invite.id}
            className="flex items-center justify-between rounded-lg bg-white dark:bg-gray-800 p-4 shadow"
          >
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">{invite.league_name}</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Invited by {invite.inviter_username}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleDecline(invite.id)}
                disabled={actionId !== null}
                className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
              >
                Decline
              </button>
              <button
                onClick={() => handleAccept(invite.id, invite.league_id)}
                disabled={actionId !== null}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {actionId === invite.id ? 'Accepting...' : 'Accept'}
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
