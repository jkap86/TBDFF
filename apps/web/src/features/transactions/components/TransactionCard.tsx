'use client';

import type { Transaction } from '@/lib/api';

const typeLabels: Record<string, string> = {
  trade: 'Trade',
  waiver: 'Waiver',
  free_agent: 'Free Agent',
  commissioner: 'Commissioner',
};

const typeColors: Record<string, string> = {
  trade: 'bg-blue-100 text-blue-700',
  waiver: 'bg-purple-100 text-purple-700',
  free_agent: 'bg-green-100 text-green-700',
  commissioner: 'bg-yellow-100 text-yellow-700',
};

interface TransactionCardProps {
  transaction: Transaction;
}

export function TransactionCard({ transaction }: TransactionCardProps) {
  const adds = Object.entries(transaction.adds) as [string, number][];
  const drops = Object.entries(transaction.drops) as [string, number][];

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeColors[transaction.type] ?? typeColors.free_agent}`}>
          {typeLabels[transaction.type] ?? transaction.type}
        </span>
        <span className="text-xs text-gray-400">
          {new Date(transaction.created_at).toLocaleDateString()} {new Date(transaction.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div className="space-y-1 text-sm">
        {adds.map(([playerId, rosterId]) => (
          <div key={`add-${playerId}`} className="flex items-center gap-2">
            <span className="text-green-600 dark:text-green-400 font-medium text-xs">+ ADD</span>
            <span className="text-gray-700 dark:text-gray-300">{playerId}</span>
            <span className="text-gray-400 text-xs">to Roster {rosterId}</span>
          </div>
        ))}
        {drops.map(([playerId, rosterId]) => (
          <div key={`drop-${playerId}`} className="flex items-center gap-2">
            <span className="text-red-600 dark:text-red-400 font-medium text-xs">- DROP</span>
            <span className="text-gray-700 dark:text-gray-300">{playerId}</span>
            <span className="text-gray-400 text-xs">from Roster {rosterId}</span>
          </div>
        ))}
        {adds.length === 0 && drops.length === 0 && (
          <p className="text-gray-400 text-xs">No player moves</p>
        )}
      </div>

      {transaction.settings && typeof transaction.settings === 'object' && 'faab_amount' in transaction.settings && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          FAAB: ${String(transaction.settings.faab_amount)}
        </p>
      )}
    </div>
  );
}
