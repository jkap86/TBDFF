'use client';

import { useState } from 'react';
import type { Transaction } from '@/lib/api';
import { TransactionCard } from './TransactionCard';

const typeFilters: Array<{ label: string; value: string | undefined }> = [
  { label: 'All', value: undefined },
  { label: 'Trades', value: 'trade' },
  { label: 'Waivers', value: 'waiver' },
  { label: 'Free Agent', value: 'free_agent' },
];

interface TransactionFeedProps {
  transactions: Transaction[];
  total: number;
  playerNames?: Record<string, string>;
  rosterLabels?: Record<number, string>;
  isLoading: boolean;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  onFilterChange: (type?: string) => void;
  onLoadMore?: () => void;
}

export function TransactionFeed({ transactions, total, playerNames, rosterLabels, isLoading, isFetchingNextPage, hasNextPage, onFilterChange, onLoadMore }: TransactionFeedProps) {
  const [activeFilter, setActiveFilter] = useState<string | undefined>(undefined);

  const handleFilter = (type: string | undefined) => {
    setActiveFilter(type);
    onFilterChange(type);
  };

  return (
    <div>
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {typeFilters.map((filter) => (
          <button
            key={filter.label}
            onClick={() => handleFilter(filter.value)}
            className={`rounded-full px-3 py-1 text-sm font-medium whitespace-nowrap ${
              activeFilter === filter.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-accent-foreground hover:bg-muted-hover'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {isLoading && transactions.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">Loading transactions...</p>
      ) : transactions.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No transactions yet</p>
      ) : (
        <div className="space-y-3">
          {transactions.map((tx) => (
            <TransactionCard key={tx.id} transaction={tx} playerNames={playerNames} rosterLabels={rosterLabels} />
          ))}
          {hasNextPage && onLoadMore && (
            <button
              onClick={onLoadMore}
              disabled={isFetchingNextPage}
              className="w-full rounded-lg bg-muted py-2 text-sm font-medium text-accent-foreground hover:bg-muted-hover disabled:opacity-50"
            >
              {isFetchingNextPage ? 'Loading...' : 'Load More'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
