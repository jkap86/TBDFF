'use client';

import type { TradeProposal, TradeItem, FutureDraftPick, Player } from '@/lib/api';

const statusColors: Record<string, string> = {
  pending: 'bg-warning text-warning-foreground',
  accepted: 'bg-primary/10 text-primary',
  review: 'bg-primary/10 text-primary',
  declined: 'bg-destructive text-destructive-foreground',
  withdrawn: 'bg-muted text-muted-foreground',
  vetoed: 'bg-destructive text-destructive-foreground',
  completed: 'bg-success text-success-foreground',
  countered: 'bg-info text-info-foreground',
  expired: 'bg-muted text-muted-foreground',
};

interface TradeCardProps {
  trade: TradeProposal;
  currentUserId: string;
  isCommissioner: boolean;
  futurePicks?: FutureDraftPick[];
  playerMap?: Record<string, Player>;
  onAccept?: (tradeId: string) => void;
  onDecline?: (tradeId: string) => void;
  onWithdraw?: (tradeId: string) => void;
  onCounter?: (trade: TradeProposal) => void;
  onVeto?: (tradeId: string) => void;
  onPush?: (tradeId: string) => void;
  onViewDetail?: (trade: TradeProposal) => void;
}

export function TradeCard({
  trade,
  currentUserId,
  isCommissioner,
  futurePicks,
  playerMap,
  onAccept,
  onDecline,
  onWithdraw,
  onCounter,
  onVeto,
  onPush,
  onViewDetail,
}: TradeCardProps) {
  const isProposer = trade.proposed_by === currentUserId;
  const isReceiver = trade.proposed_to === currentUserId;

  const proposerItems = trade.items?.filter((i: TradeItem) => i.side === 'proposer') ?? [];
  const receiverItems = trade.items?.filter((i: TradeItem) => i.side === 'receiver') ?? [];

  const formatItem = (item: TradeItem) => {
    if (item.item_type === 'player') return (item.player_id && playerMap?.[item.player_id]?.full_name) || item.player_id || 'Unknown Player';
    if (item.item_type === 'draft_pick') {
      const pick = futurePicks?.find((p) => p.id === item.draft_pick_id);
      if (pick) {
        let base = `${pick.season} Rd ${pick.round}`;
        if (pick.pick_number) {
          base += ` Pick ${pick.pick_number}`;
        } else {
          base += ' Pick';
        }
        if (pick.original_owner_id !== pick.current_owner_id) {
          return `${base} (${pick.original_owner_username ?? 'Unknown'}'s)`;
        }
        return base;
      }
      return 'Draft Pick';
    }
    if (item.item_type === 'faab') return `$${item.faab_amount} FAAB`;
    return 'Unknown';
  };

  return (
    <div
      className="rounded-lg border border-border bg-card p-4 cursor-pointer hover:border-ring transition-colors glow-border"
      onClick={() => onViewDetail?.(trade)}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">
            {trade.proposed_by_username ?? 'Unknown'}
          </span>
          <span className="text-disabled text-sm">to</span>
          <span className="font-medium text-foreground">
            {trade.proposed_to_username ?? 'Unknown'}
          </span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[trade.status] ?? statusColors.pending}`}>
          {trade.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm mb-3">
        <div>
          <p className="text-xs text-muted-foreground mb-1">{trade.proposed_by_username} gives</p>
          {proposerItems.map((item: TradeItem) => (
            <p key={item.id} className="text-accent-foreground">{formatItem(item)}</p>
          ))}
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">{trade.proposed_to_username} gives</p>
          {receiverItems.map((item: TradeItem) => (
            <p key={item.id} className="text-accent-foreground">{formatItem(item)}</p>
          ))}
        </div>
      </div>

      {trade.message && (
        <p className="text-sm text-muted-foreground italic mb-3">&quot;{trade.message}&quot;</p>
      )}

      {trade.status === 'pending' && (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          {isReceiver && (
            <>
              <button
                onClick={() => onAccept?.(trade.id)}
                className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
              >
                Accept
              </button>
              <button
                onClick={() => onCounter?.(trade)}
                className="rounded bg-secondary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-secondary-hover"
              >
                Counter
              </button>
              <button
                onClick={() => onDecline?.(trade.id)}
                className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
              >
                Decline
              </button>
            </>
          )}
          {isProposer && (
            <button
              onClick={() => onWithdraw?.(trade.id)}
              className="rounded bg-secondary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-secondary-hover"
            >
              Withdraw
            </button>
          )}
        </div>
      )}

      {trade.status === 'review' && isCommissioner && (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => onPush?.(trade.id)}
            className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
          >
            Push Through
          </button>
          <button
            onClick={() => onVeto?.(trade.id)}
            className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
          >
            Veto
          </button>
        </div>
      )}

      <p className="text-xs text-disabled mt-2">
        {new Date(trade.created_at).toLocaleDateString()}
      </p>
    </div>
  );
}
