'use client';

import Link from 'next/link';
import { useLeagues } from '@/features/leagues/hooks/useLeagues';
import { LeagueCard } from '@/features/leagues/components/LeagueCard';

export default function LeaguesPage() {
  const { leagues, isLoading, error } = useLeagues();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading leagues...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-foreground">Leagues</h1>
          <Link
            href="/leagues/add"
            className="rounded bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary-hover"
          >
            Add League
          </Link>
        </div>

        {error && <div className="mb-6 rounded bg-destructive p-4 text-sm text-destructive-foreground">{error}</div>}

        {leagues.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-input bg-card p-12 text-center">
            <p className="mb-4 text-lg text-muted-foreground">You haven't joined any leagues yet</p>
            <Link
              href="/leagues/add"
              className="inline-block rounded bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary-hover"
            >
              Add Your First League
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {leagues.map((league) => (
              <LeagueCard key={league.id} league={league} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
