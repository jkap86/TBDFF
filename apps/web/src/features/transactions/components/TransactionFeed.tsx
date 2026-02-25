'use client';

import { useState } from 'react';
import type { Transaction, TransactionType } from '@/lib/api';
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
  isLoading: boolean;
  onFilterChange: (type?: string) => void;
  onLoadMore?: () => void;
}

export function TransactionFeed({ transactions, total, isLoading, onFilterChange, onLoadMore }: TransactionFeedProps) {
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
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {isLoading && transactions.length === 0 ? (
        <p className="text-center text-gray-500 dark:text-gray-400 py-8">Loading transactions...</p>
      ) : transactions.length === 0 ? (
        <p className="text-center text-gray-500 dark:text-gray-400 py-8">No transactions yet</p>
      ) : (
        <div className="space-y-3">
          {transactions.map((tx) => (
            <TransactionCard key={tx.id} transaction={tx} />
          ))}
          {transactions.length < total && onLoadMore && (
            <button
              onClick={onLoadMore}
              className="w-full rounded-lg bg-gray-100 dark:bg-gray-700 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Load More
            </button>
          )}
        </div>
      )}
    </div>
  );
}
