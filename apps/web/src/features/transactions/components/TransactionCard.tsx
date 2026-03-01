'use client';

import type { Transaction } from '@/lib/api';

const typeLabels: Record<string, string> = {
  trade: 'Trade',
  waiver: 'Waiver',
  free_agent: 'Free Agent',
  commissioner: 'Commissioner',
};

const typeColors: Record<string, string> = {
  trade: 'bg-primary/10 text-primary',
  waiver: 'bg-info text-info-foreground',
  free_agent: 'bg-success text-success-foreground',
  commissioner: 'bg-warning text-warning-foreground',
};

interface TransactionCardProps {
  transaction: Transaction;
  playerNames?: Record<string, string>;
}

export function TransactionCard({ transaction, playerNames }: TransactionCardProps) {
  const adds = Object.entries(transaction.adds) as [string, number][];
  const drops = Object.entries(transaction.drops) as [string, number][];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeColors[transaction.type] ?? typeColors.free_agent}`}>
          {typeLabels[transaction.type] ?? transaction.type}
        </span>
        <span className="text-xs text-disabled">
          {new Date(transaction.created_at).toLocaleDateString()} {new Date(transaction.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div className="space-y-1 text-sm">
        {adds.map(([playerId, rosterId]) => (
          <div key={`add-${playerId}`} className="flex items-center gap-2">
            <span className="text-success-foreground font-medium text-xs">+ ADD</span>
            <span className="text-accent-foreground">{playerNames?.[playerId] || playerId}</span>
            <span className="text-disabled text-xs">to Roster {rosterId}</span>
          </div>
        ))}
        {drops.map(([playerId, rosterId]) => (
          <div key={`drop-${playerId}`} className="flex items-center gap-2">
            <span className="text-destructive-foreground font-medium text-xs">- DROP</span>
            <span className="text-accent-foreground">{playerNames?.[playerId] || playerId}</span>
            <span className="text-disabled text-xs">from Roster {rosterId}</span>
          </div>
        ))}
        {adds.length === 0 && drops.length === 0 && (
          <p className="text-disabled text-xs">No player moves</p>
        )}
      </div>

      {transaction.settings && typeof transaction.settings === 'object' && 'faab_amount' in transaction.settings && (
        <p className="mt-1 text-xs text-muted-foreground">
          FAAB: ${String(transaction.settings.faab_amount)}
        </p>
      )}
    </div>
  );
}
