'use client';

import { useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useTransactions } from '@/features/transactions/hooks/useTransactions';
import { TransactionFeed } from '@/features/transactions/components/TransactionFeed';

export default function TransactionsPage() {
  const params = useParams();
  const leagueId = params.leagueId as string;

  const { transactions, total, playerNames, isLoading, fetchTransactions } = useTransactions(leagueId);

  const handleFilterChange = useCallback((type?: string) => {
    fetchTransactions({ type, limit: 25, offset: 0 });
  }, [fetchTransactions]);

  const handleLoadMore = useCallback(() => {
    fetchTransactions({ limit: 25, offset: transactions.length });
  }, [fetchTransactions, transactions.length]);

  return (
    <div className="min-h-screen bg-surface p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href={`/leagues/${leagueId}`}
            className="rounded p-2 text-muted-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Activity Feed</h1>
        </div>

        {/* Transaction Feed */}
        <div className="rounded-lg bg-card p-6 shadow">
          <TransactionFeed
            transactions={transactions}
            total={total}
            playerNames={playerNames}
            isLoading={isLoading}
            onFilterChange={handleFilterChange}
            onLoadMore={handleLoadMore}
          />
        </div>
      </div>
    </div>
  );
}
