'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { playerApi } from '@/lib/api';
import type { Player, TradeProposal } from '@/lib/api';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useTrades } from '@/features/trades/hooks/useTrades';
import { useTradeSocket } from '@/features/trades/hooks/useTradeSocket';
import { useMembersQuery, useRostersQuery } from '@/hooks/useLeagueQueries';
import { TradeCard } from '@/features/trades/components/TradeCard';
import { TradeComposer } from '@/features/trades/components/TradeComposer';
import { Skeleton } from '@/components/ui/Skeleton';

interface TradesViewProps {
  leagueId: string;
}

export function TradesView({ leagueId }: TradesViewProps) {
  const { accessToken, user } = useAuth();

  const [playerMap, setPlayerMap] = useState<Record<string, Player>>({});
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [counterTarget, setCounterTarget] = useState<TradeProposal | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [confirmAction, setConfirmAction] = useState<{
    label: string;
    tradeId: string;
    action: (id: string) => Promise<any>;
  } | null>(null);

  const queryClient = useQueryClient();
  const { data: members = [] } = useMembersQuery(leagueId);
  const { data: rosters = [] } = useRostersQuery(leagueId);

  const {
    trades,
    futurePicks,
    isLoading,
    error,
    picksError,
    invalidateTrades,
    proposeTrade,
    acceptTrade,
    declineTrade,
    withdrawTrade,
    counterTrade,
    vetoTrade,
    pushTrade,
  } = useTrades(leagueId, statusFilter);

  const allPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of rosters) {
      for (const pid of r.players) ids.add(pid);
    }
    for (const t of trades) {
      for (const item of t.items ?? []) {
        if (item.item_type === 'player' && item.player_id) ids.add(item.player_id);
      }
    }
    return Array.from(ids);
  }, [rosters, trades]);

  useEffect(() => {
    if (!accessToken || allPlayerIds.length === 0) return;
    playerApi
      .getByIds(allPlayerIds, accessToken)
      .then((res) => {
        const map: Record<string, Player> = {};
        for (const p of res.players) {
          if (p) map[p.id] = p;
        }
        setPlayerMap(map);
      })
      .catch(() => {});
  }, [allPlayerIds, accessToken]);

  const handleTradeUpdate = useCallback(
    (trade: TradeProposal) => {
      invalidateTrades();
      if (trade.status === 'completed') {
        queryClient.invalidateQueries({ queryKey: ['rosters', leagueId] });
        queryClient.invalidateQueries({ queryKey: ['futurePicks', leagueId] });
      }
    },
    [invalidateTrades, queryClient, leagueId],
  );

  useTradeSocket(leagueId, handleTradeUpdate);

  const currentMember = members.find((m) => m.user_id === user?.id);
  const isCommissioner = currentMember?.role === 'commissioner';

  const statusFilters = [
    { label: 'All', value: undefined },
    { label: 'Pending', value: 'pending' },
    { label: 'In Review', value: 'review' },
    { label: 'Completed', value: 'completed' },
    { label: 'Declined', value: 'declined' },
    { label: 'Withdrawn', value: 'withdrawn' },
    { label: 'Countered', value: 'countered' },
    { label: 'Vetoed', value: 'vetoed' },
  ];

  const handleAction = async (action: (id: string) => Promise<any>, tradeId: string) => {
    try {
      await action(tradeId);
      setConfirmAction(null);
    } catch (err) {
      console.error('Trade action failed:', err);
    }
  };

  const confirmAndAct = (
    label: string,
    action: (id: string) => Promise<any>,
    tradeId: string,
  ) => {
    setConfirmAction({ label, tradeId, action });
  };

  const handleCounter = (trade: TradeProposal) => {
    setCounterTarget(trade);
    setIsComposerOpen(true);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Inline header bar */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-2">
        <h2 className="text-sm font-heading font-bold uppercase tracking-wide text-accent-foreground">
          Trade Center
        </h2>
        <button
          onClick={() => setIsComposerOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-hover transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Propose
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
        {/* Status Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {statusFilters.map((filter) => (
            <button
              key={filter.label}
              onClick={() => setStatusFilter(filter.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                statusFilter === filter.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-accent-foreground hover:bg-muted-hover'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded bg-destructive p-3 text-xs text-destructive-foreground">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg bg-card p-4 shadow">
                <div className="flex items-center justify-between mb-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-12 rounded-full" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : trades.length === 0 ? (
          <div className="rounded-lg bg-card glass-strong glow-border p-6 shadow text-center">
            <p className="text-sm text-muted-foreground">No trades found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Click &quot;Propose&quot; to get started
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {trades.map((trade) => (
              <TradeCard
                key={trade.id}
                trade={trade}
                currentUserId={user?.id ?? ''}
                isCommissioner={isCommissioner}
                futurePicks={futurePicks}
                playerMap={playerMap}
                onAccept={(id) => confirmAndAct('Accept', acceptTrade, id)}
                onDecline={(id) => confirmAndAct('Decline', declineTrade, id)}
                onWithdraw={(id) => confirmAndAct('Withdraw', withdrawTrade, id)}
                onCounter={handleCounter}
                onVeto={(id) => confirmAndAct('Veto', vetoTrade, id)}
                onPush={(id) => confirmAndAct('Push Through', pushTrade, id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Trade Composer Modal */}
      <TradeComposer
        isOpen={isComposerOpen}
        onClose={() => {
          setIsComposerOpen(false);
          setCounterTarget(null);
        }}
        members={members}
        rosters={rosters}
        currentUserId={user?.id ?? ''}
        playerMap={playerMap}
        futurePicks={futurePicks}
        picksError={picksError}
        onSubmit={proposeTrade}
        mode={counterTarget ? 'counter' : 'propose'}
        counterTradeId={counterTarget?.id}
        fixedPartner={
          counterTarget
            ? {
                userId: counterTarget.proposed_by,
                username: counterTarget.proposed_by_username ?? 'Unknown',
              }
            : undefined
        }
        onSubmitCounter={counterTrade}
      />

      {/* Confirmation Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="rounded-lg bg-card glass-strong glow-border p-6 shadow-xl max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold gradient-text font-heading mb-2">
              Confirm Action
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to <strong>{confirmAction.label.toLowerCase()}</strong> this
              trade? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAction(confirmAction.action, confirmAction.tradeId)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
              >
                {confirmAction.label}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
