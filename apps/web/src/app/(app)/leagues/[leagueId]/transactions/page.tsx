'use client';

import { useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useTransactions } from '@/features/transactions/hooks/useTransactions';
import { TransactionFeed } from '@/features/transactions/components/TransactionFeed';

export default function TransactionsPage() {
  const params = useParams();
  const router = useRouter();
  const leagueId = params.leagueId as string;

  const { transactions, total, isLoading, fetchTransactions } = useTransactions(leagueId);

  const handleFilterChange = useCallback((type?: string) => {
    fetchTransactions({ type, limit: 25, offset: 0 });
  }, [fetchTransactions]);

  const handleLoadMore = useCallback(() => {
    fetchTransactions({ limit: 25, offset: transactions.length });
  }, [fetchTransactions, transactions.length]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/leagues/${leagueId}`)}
            className="rounded p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Activity Feed</h1>
        </div>

        {/* Transaction Feed */}
        <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow">
          <TransactionFeed
            transactions={transactions}
            total={total}
            isLoading={isLoading}
            onFilterChange={handleFilterChange}
            onLoadMore={handleLoadMore}
          />
        </div>
      </div>
    </div>
  );
}
