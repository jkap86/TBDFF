'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { LeagueMember, Roster } from '@tbdff/shared';
import { useTransactions } from '@/features/transactions/hooks/useTransactions';
import { TransactionCard } from '@/features/transactions/components/TransactionCard';

interface RecentActivityCardProps {
  leagueId: string;
  members: LeagueMember[];
  rosters: Roster[];
}

export function RecentActivityCard({ leagueId, members, rosters }: RecentActivityCardProps) {
  const { transactions, playerNames, isLoading } = useTransactions(leagueId);

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

  const recent = transactions.slice(0, 5);

  return (
    <div className="rounded-lg bg-card glass-strong glow-border p-6 shadow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-heading font-bold uppercase tracking-wide text-accent-foreground">
          Recent Activity
        </h3>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : recent.length === 0 ? (
        <p className="text-sm text-muted-foreground">No transactions yet this season.</p>
      ) : (
        <div className="space-y-3">
          {recent.map((tx) => (
            <TransactionCard
              key={tx.id}
              transaction={tx}
              playerNames={playerNames}
              rosterLabels={rosterLabels}
            />
          ))}
        </div>
      )}

      <Link
        href={`/leagues/${leagueId}/transactions`}
        className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-link hover:underline"
      >
        Full activity feed
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
