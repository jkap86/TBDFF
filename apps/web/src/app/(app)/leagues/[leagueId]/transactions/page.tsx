'use client';

import { useState, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useTransactions } from '@/features/transactions/hooks/useTransactions';
import { useTransactionSocket } from '@/features/transactions/hooks/useTransactionSocket';
import { TransactionFeed } from '@/features/transactions/components/TransactionFeed';
import { useMembersQuery, useRostersQuery } from '@/hooks/useLeagueQueries';
import { LeagueSubPageHeader } from '@/components/ui/LeagueSubPageHeader';

export default function TransactionsPage() {
  const params = useParams();
  const leagueId = params.leagueId as string;
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);

  const { data: members = [] } = useMembersQuery(leagueId);
  const { data: rosters = [] } = useRostersQuery(leagueId);

  const {
    transactions, total, playerNames,
    isLoading, isFetchingNextPage, hasNextPage,
    fetchNextPage,
  } = useTransactions(leagueId, typeFilter);
  useTransactionSocket(leagueId);

  const rosterLabels = useMemo(() => {
    const map: Record<number, string> = {};
    for (const r of rosters) {
      if (r.owner_id) {
        const m = members.find((mem) => mem.user_id === r.owner_id);
        if (m) map[r.roster_id] = m.display_name || m.username;
      }
    }
    return map;
  }, [rosters, members]);

  const handleFilterChange = useCallback((type?: string) => {
    setTypeFilter(type);
  }, []);

  const handleLoadMore = useCallback(() => {
    fetchNextPage();
  }, [fetchNextPage]);

  return (
    <div className="min-h-screen bg-surface p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <LeagueSubPageHeader leagueId={leagueId} title="Activity Feed" />

        {/* Transaction Feed */}
        <div className="rounded-lg bg-card glass-strong glow-border p-6 shadow">
          <TransactionFeed
            transactions={transactions}
            total={total}
            playerNames={playerNames}
            rosterLabels={rosterLabels}
            isLoading={isLoading}
            isFetchingNextPage={isFetchingNextPage}
            hasNextPage={hasNextPage}
            onFilterChange={handleFilterChange}
            onLoadMore={handleLoadMore}
          />
        </div>
      </div>
    </div>
  );
}
