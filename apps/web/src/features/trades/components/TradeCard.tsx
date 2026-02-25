'use client';

import type { TradeProposal, TradeItem } from '@/lib/api';

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  accepted: 'bg-blue-100 text-blue-700',
  review: 'bg-blue-100 text-blue-700',
  declined: 'bg-red-100 text-red-700',
  withdrawn: 'bg-gray-100 text-gray-500',
  vetoed: 'bg-red-100 text-red-700',
  completed: 'bg-green-100 text-green-700',
  countered: 'bg-purple-100 text-purple-700',
  expired: 'bg-gray-100 text-gray-500',
};

interface TradeCardProps {
  trade: TradeProposal;
  currentUserId: string;
  isCommissioner: boolean;
  onAccept?: (tradeId: string) => void;
  onDecline?: (tradeId: string) => void;
  onWithdraw?: (tradeId: string) => void;
  onVeto?: (tradeId: string) => void;
  onPush?: (tradeId: string) => void;
  onViewDetail?: (trade: TradeProposal) => void;
}

export function TradeCard({
  trade,
  currentUserId,
  isCommissioner,
  onAccept,
  onDecline,
  onWithdraw,
  onVeto,
  onPush,
  onViewDetail,
}: TradeCardProps) {
  const isProposer = trade.proposed_by === currentUserId;
  const isReceiver = trade.proposed_to === currentUserId;

  const proposerItems = trade.items?.filter((i: TradeItem) => i.side === 'proposer') ?? [];
  const receiverItems = trade.items?.filter((i: TradeItem) => i.side === 'receiver') ?? [];

  const formatItem = (item: TradeItem) => {
    if (item.item_type === 'player') return item.player_id ?? 'Unknown Player';
    if (item.item_type === 'draft_pick') return `Draft Pick`;
    if (item.item_type === 'faab') return `$${item.faab_amount} FAAB`;
    return 'Unknown';
  };

  return (
    <div
      className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 cursor-pointer hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
      onClick={() => onViewDetail?.(trade)}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 dark:text-white">
            {trade.proposed_by_username ?? 'Unknown'}
          </span>
          <span className="text-gray-400 text-sm">to</span>
          <span className="font-medium text-gray-900 dark:text-white">
            {trade.proposed_to_username ?? 'Unknown'}
          </span>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[trade.status] ?? statusColors.pending}`}>
          {trade.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm mb-3">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{trade.proposed_by_username} gives</p>
          {proposerItems.map((item: TradeItem) => (
            <p key={item.id} className="text-gray-700 dark:text-gray-300">{formatItem(item)}</p>
          ))}
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{trade.proposed_to_username} gives</p>
          {receiverItems.map((item: TradeItem) => (
            <p key={item.id} className="text-gray-700 dark:text-gray-300">{formatItem(item)}</p>
          ))}
        </div>
      </div>

      {trade.message && (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic mb-3">&quot;{trade.message}&quot;</p>
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
              className="rounded bg-gray-600 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700"
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

      <p className="text-xs text-gray-400 mt-2">
        {new Date(trade.created_at).toLocaleDateString()}
      </p>
    </div>
  );
}
