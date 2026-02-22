'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Settings } from 'lucide-react';
import { leagueApi, ApiError, type League, type LeagueMember, type UpdateLeagueRequest } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { LeagueSettingsModal } from '@/features/leagues/components/LeagueSettingsModal';

export default function LeagueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leagueId = params.leagueId as string;
  const { accessToken, user } = useAuth();

  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!accessToken) return;

      try {
        setIsLoading(true);
        setError(null);

        const [leagueResult, membersResult] = await Promise.all([
          leagueApi.getById(leagueId, accessToken),
          leagueApi.getMembers(leagueId, accessToken),
        ]);

        setLeague(leagueResult.league);
        setMembers(membersResult.members);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('Failed to load league');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [leagueId, accessToken]);

  const handleUpdateLeague = async (updates: UpdateLeagueRequest) => {
    if (!accessToken) throw new Error('Not authenticated');

    const result = await leagueApi.update(leagueId, updates, accessToken);
    setLeague(result.league);
  };

  const handleDeleteLeague = async () => {
    if (!accessToken) throw new Error('Not authenticated');

    await leagueApi.delete(leagueId, accessToken);
    router.push('/leagues');
  };

  // Check if current user is a commissioner (commissioner is the owner in this app)
  const currentUserMember = members.find((m) => m.user_id === user?.id);
  const isCommissioner = currentUserMember?.role === 'commissioner';
  const isOwner = isCommissioner; // Commissioner is the owner role

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500">Loading league...</div>
      </div>
    );
  }

  if (error || !league) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-4xl">
          <div className="rounded bg-red-50 p-4 text-red-600">{error || 'League not found'}</div>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pre_draft: 'bg-gray-100 text-gray-700',
    drafting: 'bg-blue-100 text-blue-700',
    in_season: 'bg-green-100 text-green-700',
    complete: 'bg-gray-100 text-gray-500',
  };

  const statusLabels: Record<string, string> = {
    pre_draft: 'Pre-Draft',
    drafting: 'Drafting',
    in_season: 'In Season',
    complete: 'Complete',
  };

  const roleColors: Record<string, string> = {
    commissioner: 'bg-blue-100 text-blue-700',
    member: 'bg-gray-100 text-gray-600',
    spectator: 'bg-yellow-100 text-yellow-700',
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* League Header */}
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900">{league.name}</h1>
              {isCommissioner && (
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="rounded p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  title="League Settings"
                >
                  <Settings className="h-5 w-5" />
                </button>
              )}
            </div>
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${statusColors[league.status] || statusColors.pre_draft}`}
            >
              {statusLabels[league.status] || league.status}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-gray-500">Season</p>
              <p className="text-lg font-medium text-gray-900">{league.season}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Teams</p>
              <p className="text-lg font-medium text-gray-900">{league.total_rosters}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">League Type</p>
              <p className="text-lg font-medium text-gray-900">
                {league.settings?.type === 0
                  ? 'Redraft'
                  : league.settings?.type === 1
                    ? 'Keeper'
                    : 'Dynasty'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Scoring</p>
              <p className="text-lg font-medium text-gray-900">
                {league.scoring_settings?.rec === 1
                  ? 'PPR'
                  : league.scoring_settings?.rec === 0.5
                    ? 'Half-PPR'
                    : 'Standard'}
              </p>
            </div>
          </div>
        </div>

        {/* Members List */}
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-bold text-gray-900">
            Members ({members.length}/{league.total_rosters})
          </h2>

          <div className="space-y-2">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between rounded border border-gray-200 p-3"
              >
                <div>
                  <p className="font-medium text-gray-900">{member.username}</p>
                  {member.display_name && (
                    <p className="text-sm text-gray-500">{member.display_name}</p>
                  )}
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium uppercase ${roleColors[member.role]}`}
                >
                  {member.role}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {league && (
        <LeagueSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          league={league}
          onUpdate={handleUpdateLeague}
          onDelete={handleDeleteLeague}
          isOwner={isCommissioner}
        />
      )}
    </div>
  );
}
