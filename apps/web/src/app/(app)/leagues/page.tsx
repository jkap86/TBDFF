'use client';

import { useState } from 'react';
import { useLeagues } from '@/features/leagues/hooks/useLeagues';
import { CreateLeagueModal } from '@/features/leagues/components/CreateLeagueModal';
import { LeagueCard } from '@/features/leagues/components/LeagueCard';

export default function LeaguesPage() {
  const { leagues, isLoading, error, createLeague } = useLeagues();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleCreateLeague = async (data: { name: string; season: string; total_rosters: number }) => {
    await createLeague(data);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500">Loading leagues...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">My Leagues</h1>
          <button
            onClick={() => setIsModalOpen(true)}
            className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
          >
            Create League
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded bg-red-50 p-4 text-sm text-red-600">{error}</div>
        )}

        {leagues.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-12 text-center">
            <p className="mb-4 text-lg text-gray-500">You haven't joined any leagues yet</p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="rounded bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700"
            >
              Create Your First League
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {leagues.map((league) => (
              <LeagueCard key={league.id} league={league} />
            ))}
          </div>
        )}

        <CreateLeagueModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onCreate={handleCreateLeague}
        />
      </div>
    </div>
  );
}
