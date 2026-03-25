'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, X } from 'lucide-react';
import { useLeagues } from '@/features/leagues/hooks/useLeagues';
import { LeagueCard } from '@/features/leagues/components/LeagueCard';
import { LeaguesPageSkeleton } from '@/features/leagues/components/LeaguesPageSkeleton';

const statusFilters = [
  { value: '', label: 'All' },
  { value: 'reg_season', label: 'Regular Season' },
  { value: 'post_season', label: 'Post Season' },
  { value: 'offseason', label: 'Offseason' },
  { value: 'not_filled', label: 'Not Filled' },
  { value: 'complete', label: 'Complete' },
] as const;

const typeFilters = [
  { value: '', label: 'All Types' },
  { value: '0', label: 'Redraft' },
  { value: '1', label: 'Keeper' },
  { value: '2', label: 'Dynasty' },
] as const;

export default function LeaguesPage() {
  const { leagues, isLoading, error } = useLeagues();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const seasons = useMemo(() => {
    const set = new Set(leagues.map((l) => l.season));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [leagues]);

  const [seasonFilter, setSeasonFilter] = useState('');

  const filtered = useMemo(() => {
    return leagues.filter((league) => {
      if (search && !league.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter && league.status !== statusFilter) return false;
      if (seasonFilter && league.season !== seasonFilter) return false;
      if (typeFilter && league.settings?.type !== Number(typeFilter)) return false;
      return true;
    });
  }, [leagues, search, statusFilter, seasonFilter, typeFilter]);

  const hasActiveFilters = search || statusFilter || seasonFilter || typeFilter;

  if (isLoading) {
    return <LeaguesPageSkeleton />;
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col bg-surface">
      <div className="sticky top-14 z-10 border-b border-border bg-surface px-6 py-4">
        <div className="mx-auto max-w-2xl space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold font-heading gradient-text glow-text-strong">
              Leagues
            </h1>
            <Link
              href="/leagues/add"
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 transition-colors glow-border"
            >
              <Plus className="h-4 w-4" />
            </Link>
          </div>

          {leagues.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[160px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search leagues..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none"
              >
                {statusFilters.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none"
              >
                {typeFilters.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              {seasons.length > 1 && (
                <select
                  value={seasonFilter}
                  onChange={(e) => setSeasonFilter(e.target.value)}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none"
                >
                  <option value="">All Seasons</option>
                  {seasons.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}
              {hasActiveFilters && (
                <button
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('');
                    setTypeFilter('');
                    setSeasonFilter('');
                  }}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label="Clear filters"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-sleek">
        <div className="mx-auto max-w-2xl">
          {error && (
            <div className="mb-4 rounded bg-destructive p-4 text-sm text-destructive-foreground">
              {error}
            </div>
          )}

          {leagues.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-input bg-card p-12 text-center">
              <p className="mb-4 text-lg text-muted-foreground">
                You haven&apos;t joined any leagues yet
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No leagues match your filters</p>
          ) : (
            <div className="flex flex-col gap-4">
              {filtered.map((league) => (
                <LeagueCard key={league.id} league={league} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
