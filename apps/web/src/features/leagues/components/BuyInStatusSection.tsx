'use client';

import { Check, X } from 'lucide-react';
import type { LeagueMember, LeaguePayment } from '@tbdff/shared';

interface BuyInStatusSectionProps {
  members: LeagueMember[];
  paidUserIds: Set<string>;
  buyInPayments: LeaguePayment[];
  buyInAmount: number;
  isMarkingAll: boolean;
  onMarkPaid: (userId: string) => void;
  onMarkUnpaid: (paymentId: string) => void;
  onMarkAllPaid: () => void;
}

export function BuyInStatusSection({
  members,
  paidUserIds,
  buyInPayments,
  buyInAmount,
  isMarkingAll,
  onMarkPaid,
  onMarkUnpaid,
  onMarkAllPaid,
}: BuyInStatusSectionProps) {
  if (members.length === 0) return null;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-accent-foreground">Buy-in Status</h4>
        {members.some((m) => !paidUserIds.has(m.user_id)) && (
          <button
            type="button"
            onClick={onMarkAllPaid}
            disabled={isMarkingAll}
            className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {isMarkingAll ? 'Marking...' : `Mark All Paid (${members.filter((m) => !paidUserIds.has(m.user_id)).length})`}
          </button>
        )}
      </div>
      <div className="space-y-1">
        {members.map((member) => {
          const buyInPayment = buyInPayments.find((p) => p.user_id === member.user_id);
          const isPaid = !!buyInPayment;

          return (
            <div
              key={member.user_id}
              className="flex items-center justify-between rounded border border-border px-3 py-2"
            >
              <span className="text-sm font-medium text-foreground">
                {member.display_name || member.username}
              </span>
              <div className="flex items-center gap-2">
                {isPaid ? (
                  <>
                    <span className="rounded-full bg-success px-2 py-0.5 text-xs font-medium text-success-foreground">
                      Paid
                    </span>
                    <button
                      type="button"
                      onClick={() => onMarkUnpaid(buyInPayment.id)}
                      className="rounded p-1 text-disabled hover:bg-destructive hover:text-destructive-foreground"
                      title="Remove payment"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      Unpaid
                    </span>
                    <button
                      type="button"
                      onClick={() => onMarkPaid(member.user_id)}
                      className="rounded p-1 text-disabled hover:bg-success hover:text-success-foreground"
                      title="Mark as paid"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
