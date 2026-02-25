'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Settings, MessageSquare } from 'lucide-react';
import { leagueApi, draftApi, matchupApi, ApiError, type League, type LeagueMember, type Roster, type UpdateLeagueRequest, type Draft, type Matchup } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { LeagueSettingsModal } from '@/features/leagues/components/LeagueSettingsModal';
import { LeagueChat } from '@/features/chat/components/LeagueChat';
import { useConversations } from '@/features/chat/hooks/useConversations';
import { useDMPanel } from '@/features/chat/context/DMPanelContext';

const draftTypeLabels: Record<string, string> = {
  snake: 'Snake',
  linear: 'Linear',
  '3rr': '3rd Round Reversal',
  auction: 'Auction',
};

export default function LeagueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leagueId = params.leagueId as string;
  const { accessToken, user } = useAuth();

  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);
  const [isGeneratingMatchups, setIsGeneratingMatchups] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const { startConversation } = useConversations();
  const { openConversation } = useDMPanel();

  useEffect(() => {
    const fetchData = async () => {
      if (!accessToken) return;

      try {
        setIsLoading(true);
        setError(null);

        const [leagueResult, membersResult, rostersResult, draftsResult, matchupsResult] = await Promise.all([
          leagueApi.getById(leagueId, accessToken),
          leagueApi.getMembers(leagueId, accessToken),
          leagueApi.getRosters(leagueId, accessToken),
          draftApi.getByLeague(leagueId, accessToken),
          matchupApi.getAll(leagueId, accessToken).catch(() => ({ matchups: [] })),
        ]);

        setLeague(leagueResult.league);
        setMembers(membersResult.members);
        setRosters(rostersResult.rosters);
        setDrafts(draftsResult.drafts);
        setMatchups(matchupsResult.matchups);
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

  const handleAssignRoster = async (rosterId: number, userId: string) => {
    if (!accessToken) throw new Error('Not authenticated');

    const result = await leagueApi.assignRoster(leagueId, rosterId, { user_id: userId }, accessToken);
    // Update local state
    setRosters((prev) => prev.map((r) => (r.roster_id === rosterId ? result.roster : r)));
    setMembers((prev) => prev.map((m) => (m.user_id === result.member.user_id ? result.member : m)));
  };

  const handleUnassignRoster = async (rosterId: number) => {
    if (!accessToken) throw new Error('Not authenticated');

    await leagueApi.unassignRoster(leagueId, rosterId, accessToken);
    // Refetch members and rosters to get updated state
    const [membersResult, rostersResult] = await Promise.all([
      leagueApi.getMembers(leagueId, accessToken),
      leagueApi.getRosters(leagueId, accessToken),
    ]);
    setMembers(membersResult.members);
    setRosters(rostersResult.rosters);
  };

  const handleCreateDraft = async () => {
    if (!accessToken) return;

    try {
      setIsCreatingDraft(true);
      const result = await draftApi.create(leagueId, {}, accessToken);
      setDrafts((prev) => [result.draft, ...prev]);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    } finally {
      setIsCreatingDraft(false);
    }
  };

  const handleGenerateMatchups = async () => {
    if (!accessToken) return;

    try {
      setIsGeneratingMatchups(true);
      const result = await matchupApi.generate(leagueId, accessToken);
      setMatchups(result.matchups);
      setSelectedWeek(1);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    } finally {
      setIsGeneratingMatchups(false);
    }
  };

  const handleStartDM = async (memberId: string) => {
    try {
      const conversation = await startConversation(memberId);
      openConversation(conversation);
    } catch {
      // Non-fatal — user may already have the panel open
    }
  };

  // Check if current user is a commissioner (commissioner is the owner in this app)
  const currentUserMember = members.find((m) => m.user_id === user?.id);
  const isCommissioner = currentUserMember?.role === 'commissioner';
  const isOwner = isCommissioner; // Commissioner is the owner role

  // Find the active draft (pre_draft or drafting)
  const activeDraft = drafts.find((d) => d.status === 'pre_draft' || d.status === 'drafting');

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading league...</div>
      </div>
    );
  }

  if (error || !league) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="mx-auto max-w-4xl">
          <div className="rounded bg-red-50 dark:bg-red-900/30 p-4 text-red-600 dark:text-red-400">{error || 'League not found'}</div>
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

  const draftStatusColors: Record<string, string> = {
    pre_draft: 'bg-yellow-100 text-yellow-700',
    drafting: 'bg-blue-100 text-blue-700',
    complete: 'bg-green-100 text-green-700',
  };

  const draftStatusLabels: Record<string, string> = {
    pre_draft: 'Setup',
    drafting: 'In Progress',
    complete: 'Complete',
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* League Header */}
        <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{league.name}</h1>
              {isCommissioner && (
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="rounded p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300"
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
              <p className="text-sm text-gray-500 dark:text-gray-400">Season</p>
              <p className="text-lg font-medium text-gray-900 dark:text-white">{league.season}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Teams</p>
              <p className="text-lg font-medium text-gray-900 dark:text-white">{league.total_rosters}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">League Type</p>
              <p className="text-lg font-medium text-gray-900 dark:text-white">
                {league.settings?.type === 0
                  ? 'Redraft'
                  : league.settings?.type === 1
                    ? 'Keeper'
                    : 'Dynasty'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Scoring</p>
              <p className="text-lg font-medium text-gray-900 dark:text-white">
                {league.scoring_settings?.rec === 1
                  ? 'PPR'
                  : league.scoring_settings?.rec === 0.5
                    ? 'Half-PPR'
                    : 'Standard'}
              </p>
            </div>
          </div>
        </div>

        {/* Draft Card */}
        <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Draft</h2>
            {activeDraft && (
              <span className={`rounded-full px-3 py-1 text-sm font-medium ${draftStatusColors[activeDraft.status]}`}>
                {draftStatusLabels[activeDraft.status]}
              </span>
            )}
          </div>

          {activeDraft ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Type</p>
                  <p className="font-medium text-gray-900 dark:text-white">{draftTypeLabels[activeDraft.type] || activeDraft.type}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Rounds</p>
                  <p className="font-medium text-gray-900 dark:text-white">{activeDraft.settings.rounds}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Pick Timer</p>
                  <p className="font-medium text-gray-900 dark:text-white">{activeDraft.settings.pick_timer}s</p>
                </div>
              </div>

              <div className="flex gap-3">
                {activeDraft.status === 'drafting' && (
                  <button
                    onClick={() => router.push(`/leagues/${leagueId}/draft`)}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Enter Draft Room
                  </button>
                )}
                {activeDraft.status === 'pre_draft' && (
                  <button
                    onClick={() => router.push(`/leagues/${leagueId}/draft`)}
                    className="rounded-lg bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
                  >
                    Draft Settings
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="mb-3 text-gray-500 dark:text-gray-400">No draft has been created yet.</p>
              {isCommissioner && (
                <button
                  onClick={handleCreateDraft}
                  disabled={isCreatingDraft}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isCreatingDraft ? 'Creating...' : 'Create Draft'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Matchups Card */}
        {(league.status === 'in_season' || league.status === 'complete') && (
          <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Matchups</h2>
              {isCommissioner && league.status === 'in_season' && (
                <button
                  onClick={handleGenerateMatchups}
                  disabled={isGeneratingMatchups}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isGeneratingMatchups
                    ? 'Generating...'
                    : matchups.length > 0
                      ? 'Re-Randomize Schedule'
                      : 'Generate Schedule'}
                </button>
              )}
            </div>

            {matchups.length > 0 ? (
              <div>
                {/* Week selector */}
                <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
                  {Array.from(new Set(matchups.map((m) => m.week)))
                    .sort((a, b) => a - b)
                    .map((week) => (
                      <button
                        key={week}
                        onClick={() => setSelectedWeek(week)}
                        className={`rounded-full px-3 py-1 text-sm font-medium whitespace-nowrap ${
                          selectedWeek === week
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        Wk {week}
                      </button>
                    ))}
                </div>

                {/* Matchup pairings for selected week */}
                <div className="space-y-2">
                  {(() => {
                    const weekMatchups = matchups.filter(
                      (m) => m.week === selectedWeek && m.matchup_id > 0
                    );
                    const grouped: Record<number, Matchup[]> = {};
                    for (const m of weekMatchups) {
                      if (!grouped[m.matchup_id]) grouped[m.matchup_id] = [];
                      grouped[m.matchup_id].push(m);
                    }

                    const byes = matchups.filter(
                      (m) => m.week === selectedWeek && m.matchup_id === 0
                    );

                    const getRosterLabel = (rosterId: number) => {
                      const roster = rosters.find((r) => r.roster_id === rosterId);
                      if (roster?.owner_id) {
                        const member = members.find((m) => m.user_id === roster.owner_id);
                        return member?.display_name || member?.username || `Team ${rosterId}`;
                      }
                      return `Team ${rosterId}`;
                    };

                    return (
                      <>
                        {Object.values(grouped).map((pair) => (
                          <div
                            key={pair[0].id}
                            className="flex items-center justify-between rounded border border-gray-200 dark:border-gray-700 p-3"
                          >
                            <span className="font-medium text-gray-900 dark:text-white">
                              {getRosterLabel(pair[0].roster_id)}
                            </span>
                            <span className="text-sm text-gray-400">vs</span>
                            <span className="font-medium text-gray-900 dark:text-white">
                              {pair[1] ? getRosterLabel(pair[1].roster_id) : 'BYE'}
                            </span>
                          </div>
                        ))}
                        {byes.map((bye) => (
                          <div
                            key={bye.id}
                            className="flex items-center justify-between rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3"
                          >
                            <span className="font-medium text-gray-900 dark:text-white">
                              {getRosterLabel(bye.roster_id)}
                            </span>
                            <span className="text-sm italic text-gray-400">BYE</span>
                          </div>
                        ))}
                      </>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <p className="py-4 text-center text-gray-500 dark:text-gray-400">
                {isCommissioner
                  ? 'No matchups generated yet. Click the button above to generate the schedule.'
                  : 'No matchups have been generated yet.'}
              </p>
            )}
          </div>
        )}

        {/* League Chat */}
        <div className="rounded-lg bg-white dark:bg-gray-800 shadow">
          <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">League Chat</h2>
          </div>
          <LeagueChat leagueId={leagueId} />
        </div>

        {/* Members List */}
        <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow">
          <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-white">
            Members ({members.length}/{league.total_rosters})
          </h2>

          <div className="space-y-2">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between rounded border border-gray-200 dark:border-gray-700 p-3"
              >
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{member.username}</p>
                  {member.display_name && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{member.display_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {member.user_id !== user?.id && (
                    <button
                      onClick={() => handleStartDM(member.user_id)}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600 dark:hover:bg-gray-700 dark:hover:text-blue-400"
                      title={`Message ${member.username}`}
                    >
                      <MessageSquare className="h-4 w-4" />
                    </button>
                  )}
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium uppercase ${roleColors[member.role]}`}
                  >
                    {member.role}
                  </span>
                </div>
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
          members={members}
          rosters={rosters}
          onUpdate={handleUpdateLeague}
          onDelete={handleDeleteLeague}
          onAssignRoster={handleAssignRoster}
          onUnassignRoster={handleUnassignRoster}
          isOwner={isCommissioner}
        />
      )}
    </div>
  );
}
