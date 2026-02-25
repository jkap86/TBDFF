'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';
import { leagueApi, ApiError } from '@/lib/api';
import type { LeagueMember, Roster, TradeProposal } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useTrades } from '@/features/trades/hooks/useTrades';
import { useTradeSocket } from '@/features/trades/hooks/useTradeSocket';
import { TradeCard } from '@/features/trades/components/TradeCard';
import { TradeComposer } from '@/features/trades/components/TradeComposer';

export default function TradesPage() {
  const params = useParams();
  const router = useRouter();
  const leagueId = params.leagueId as string;
  const { accessToken, user } = useAuth();

  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const {
    trades,
    isLoading,
    error,
    fetchTrades,
    proposeTrade,
    acceptTrade,
    declineTrade,
    withdrawTrade,
    vetoTrade,
    pushTrade,
  } = useTrades(leagueId);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([
      leagueApi.getMembers(leagueId, accessToken),
      leagueApi.getRosters(leagueId, accessToken),
    ]).then(([membersResult, rostersResult]) => {
      setMembers(membersResult.members);
      setRosters(rostersResult.rosters);
    }).catch(() => {});
  }, [leagueId, accessToken]);

  const handleTradeUpdate = useCallback((trade: TradeProposal) => {
    fetchTrades(statusFilter);
  }, [fetchTrades, statusFilter]);

  useTradeSocket(leagueId, handleTradeUpdate);

  const currentMember = members.find((m) => m.user_id === user?.id);
  const isCommissioner = currentMember?.role === 'commissioner';

  const statusFilters = [
    { label: 'All', value: undefined },
    { label: 'Pending', value: 'pending' },
    { label: 'In Review', value: 'review' },
    { label: 'Completed', value: 'completed' },
    { label: 'Declined', value: 'declined' },
    { label: 'Vetoed', value: 'vetoed' },
  ];

  const handleFilterChange = (value: string | undefined) => {
    setStatusFilter(value);
    fetchTrades(value);
  };

  const handleAction = async (action: (id: string) => Promise<any>, tradeId: string) => {
    try {
      await action(tradeId);
    } catch (err) {
      console.error('Trade action failed:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(`/leagues/${leagueId}`)}
              className="rounded p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Trade Center</h1>
          </div>
          <button
            onClick={() => setIsComposerOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Propose Trade
          </button>
        </div>

        {/* Status Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {statusFilters.map((filter) => (
            <button
              key={filter.label}
              onClick={() => handleFilterChange(filter.value)}
              className={`rounded-full px-3 py-1 text-sm font-medium whitespace-nowrap ${
                statusFilter === filter.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded bg-red-50 dark:bg-red-900/30 p-4 text-red-600 dark:text-red-400">{error}</div>
        )}

        {/* Trades List */}
        {isLoading ? (
          <p className="text-center text-gray-500 dark:text-gray-400 py-8">Loading trades...</p>
        ) : trades.length === 0 ? (
          <div className="rounded-lg bg-white dark:bg-gray-800 p-8 shadow text-center">
            <p className="text-gray-500 dark:text-gray-400">No trades found</p>
            <p className="text-sm text-gray-400 mt-1">Click &quot;Propose Trade&quot; to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {trades.map((trade) => (
              <TradeCard
                key={trade.id}
                trade={trade}
                currentUserId={user?.id ?? ''}
                isCommissioner={isCommissioner}
                onAccept={(id) => handleAction(acceptTrade, id)}
                onDecline={(id) => handleAction(declineTrade, id)}
                onWithdraw={(id) => handleAction(withdrawTrade, id)}
                onVeto={(id) => handleAction(vetoTrade, id)}
                onPush={(id) => handleAction(pushTrade, id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Trade Composer Modal */}
      <TradeComposer
        isOpen={isComposerOpen}
        onClose={() => setIsComposerOpen(false)}
        members={members}
        rosters={rosters}
        currentUserId={user?.id ?? ''}
        onSubmit={proposeTrade}
      />
    </div>
  );
}
