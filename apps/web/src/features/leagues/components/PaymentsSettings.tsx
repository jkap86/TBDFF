'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronDown,
  Check,
  X,
  Plus,
  Pencil,
  DollarSign,
  Trophy,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { paymentApi, ApiError } from '@/lib/api';
import type {
  LeaguePayment,
  LeagueMember,
  LeagueSettings,
  PayoutCategory,
  PayoutEntry,
} from '@tbdff/shared';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { PayoutForm } from './PayoutForm';
import { PayoutEntryList } from './PayoutEntryList';
import { BuyInStatusSection } from './BuyInStatusSection';

interface EditModeProps {
  leagueId: string;
  members: LeagueMember[];
  totalRosters: number;
  settings: LeagueSettings;
  isOpen: boolean;
  onToggle: () => void;
  onSettingsUpdate: () => void;
}

interface CreateModeProps {
  mode: 'create';
  buyIn: number;
  totalRosters: number;
  onBuyInChange: (value: number) => void;
  payouts: PayoutEntry[];
  onPayoutsChange: (payouts: PayoutEntry[]) => void;
  isOpen: boolean;
  onToggle: () => void;
}

type PaymentsSettingsProps = EditModeProps | CreateModeProps;

function computeAllocation(payouts: PayoutEntry[], buyIn: number, totalRosters: number) {
  const totalPot = buyIn * totalRosters;
  if (totalPot <= 0) return { totalPot: 0, totalAllocated: 0, percentage: 0 };

  let totalAllocated = 0;
  for (const entry of payouts) {
    totalAllocated += entry.is_percentage ? (entry.value / 100) * totalPot : entry.value;
  }

  return { totalPot, totalAllocated, percentage: (totalAllocated / totalPot) * 100 };
}

function AllocationBanner({
  payouts,
  buyIn,
  totalRosters,
}: {
  payouts: PayoutEntry[];
  buyIn: number;
  totalRosters: number;
}) {
  const { totalPot, totalAllocated, percentage } = computeAllocation(payouts, buyIn, totalRosters);
  if (totalPot <= 0) return null;

  const diff = Math.abs(totalAllocated - totalPot);
  const isOver = totalAllocated > totalPot + 0.01;
  const isUnder = totalAllocated < totalPot - 0.01;

  if (isOver) {
    return (
      <div className="flex items-center gap-2 rounded border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive-foreground">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span>
          Over-allocated by <strong>${diff.toFixed(2)}</strong> — ${totalAllocated.toFixed(2)} of $
          {totalPot.toFixed(2)} pot
        </span>
      </div>
    );
  }

  if (isUnder) {
    return (
      <div className="flex items-center gap-2 rounded border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-200">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span>
          ${totalAllocated.toFixed(2)} of ${totalPot.toFixed(2)} allocated ({percentage.toFixed(0)}
          %) — <strong>${diff.toFixed(2)}</strong> remaining
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded border border-success/30 bg-success/10 px-3 py-2 text-sm text-success-foreground">
      <Check className="h-4 w-4 flex-shrink-0" />
      <span>Fully allocated — ${totalPot.toFixed(2)} total</span>
    </div>
  );
}

export function PaymentsSettings(props: PaymentsSettingsProps) {
  const isCreateMode = 'mode' in props && props.mode === 'create';

  if (isCreateMode) {
    return <CreatePayments {...props} />;
  }

  return <EditPayments {...(props as EditModeProps)} />;
}

// ---- Create mode: buy-in + payout structure ----

function CreatePayments({
  buyIn,
  totalRosters,
  onBuyInChange,
  payouts,
  onPayoutsChange,
  isOpen,
  onToggle,
}: CreateModeProps) {
  const [isPaidLeague, setIsPaidLeague] = useState(buyIn > 0);
  const [showPayoutForm, setShowPayoutForm] = useState(false);

  const placeEntries = payouts
    .filter((e) => e.category === 'place')
    .sort((a, b) => a.position - b.position);
  const pointsEntries = payouts
    .filter((e) => e.category === 'points')
    .sort((a, b) => a.position - b.position);

  const handleRemoveEntry = (category: PayoutCategory, position: number) => {
    onPayoutsChange(payouts.filter((e) => !(e.category === category && e.position === position)));
  };

  const summary = buyIn > 0 ? `$${buyIn} buy-in` : 'Free';

  return (
    <div className="mb-4 rounded-lg border border-border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-accent-foreground hover:bg-accent rounded-lg"
      >
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <span>Payments</span>
        </div>
        <div className="flex items-center gap-2">
          {!isOpen && <span className="text-xs text-muted-foreground">{summary}</span>}
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-border px-4 py-4 space-y-5">
          {/* Paid League Toggle */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isPaidLeague}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setIsPaidLeague(checked);
                  if (!checked) onBuyInChange(0);
                }}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <span className="text-sm font-semibold text-accent-foreground">Paid League</span>
            </label>

            {isPaidLeague && (
              <div className="mt-3">
                <h4 className="mb-2 text-sm font-semibold text-accent-foreground">Buy-in Amount</h4>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">$</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={buyIn || ''}
                    onChange={(e) => onBuyInChange(parseFloat(e.target.value) || 0)}
                    className="w-28 rounded border border-input bg-card px-2 py-1 text-sm text-foreground"
                    placeholder="Enter amount"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Payout Structure - only for paid leagues */}
          {isPaidLeague && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-accent-foreground">Payout Structure</h4>
                {!showPayoutForm && (
                  <button
                    type="button"
                    onClick={() => setShowPayoutForm(true)}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-link hover:bg-primary/10"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Payout
                  </button>
                )}
              </div>

              {showPayoutForm && (
                <PayoutForm
                  payouts={payouts}
                  buyIn={buyIn}
                  totalRosters={totalRosters}
                  onAdd={(entry) => {
                    onPayoutsChange([...payouts, entry]);
                    setShowPayoutForm(false);
                  }}
                  onCancel={() => setShowPayoutForm(false)}
                />
              )}

              {placeEntries.length > 0 && (
                <div className="mb-3">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Trophy className="h-3 w-3" />
                    Place Finish
                  </div>
                  <PayoutEntryList entries={placeEntries} onRemove={handleRemoveEntry} />
                </div>
              )}

              {pointsEntries.length > 0 && (
                <div className="mb-3">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <TrendingUp className="h-3 w-3" />
                    Points Finish
                  </div>
                  <PayoutEntryList entries={pointsEntries} onRemove={handleRemoveEntry} />
                </div>
              )}

              {payouts.length === 0 && !showPayoutForm && (
                <p className="py-2 text-center text-sm text-muted-foreground">
                  No payouts configured yet.
                </p>
              )}

              <AllocationBanner payouts={payouts} buyIn={buyIn} totalRosters={totalRosters} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Edit mode: full payments management ----

function EditPayments({
  leagueId,
  members,
  totalRosters,
  settings,
  isOpen,
  onToggle,
  onSettingsUpdate,
}: EditModeProps) {
  const { accessToken } = useAuth();
  const [payments, setPayments] = useState<LeaguePayment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  // Buy-in editing
  const [isEditingBuyIn, setIsEditingBuyIn] = useState(false);
  const [buyInInput, setBuyInInput] = useState('');
  const [isSavingBuyIn, setIsSavingBuyIn] = useState(false);

  // Payout structure
  const existingPayouts = (settings as Record<string, unknown>).payouts as
    | PayoutEntry[]
    | undefined;
  const [payoutEntries, setPayoutEntries] = useState<PayoutEntry[]>(existingPayouts ?? []);
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [isSavingPayouts, setIsSavingPayouts] = useState(false);

  const buyInAmount = (settings as Record<string, unknown>).buy_in as number | undefined;
  const activeMembers = members.filter((m) => m.role !== 'spectator');

  // Sync payout entries when settings change
  useEffect(() => {
    const p = (settings as Record<string, unknown>).payouts as PayoutEntry[] | undefined;
    setPayoutEntries(p ?? []);
  }, [settings]);

  const fetchPayments = useCallback(async () => {
    if (!accessToken) return;
    try {
      setIsLoading(true);
      const result = await paymentApi.getPayments(leagueId, accessToken);
      setPayments(result.payments);
    } catch {
      // Non-fatal
    } finally {
      setIsLoading(false);
      setHasFetched(true);
    }
  }, [leagueId, accessToken]);

  // Fetch payments when section is first opened
  useEffect(() => {
    if (isOpen && !hasFetched) {
      fetchPayments();
    }
  }, [isOpen, hasFetched, fetchPayments]);

  const buyIns = payments.filter((p) => p.type === 'buy_in');
  const paidUserIds = new Set(buyIns.map((p) => p.user_id));
  const totalCollected = buyIns.reduce((sum, p) => sum + p.amount, 0);

  const placeEntries = payoutEntries
    .filter((e) => e.category === 'place')
    .sort((a, b) => a.position - b.position);
  const pointsEntries = payoutEntries
    .filter((e) => e.category === 'points')
    .sort((a, b) => a.position - b.position);

  // ---- Buy-in amount ----

  const handleSaveBuyIn = async () => {
    if (!accessToken) return;
    const value = parseFloat(buyInInput);
    if (isNaN(value) || value < 0) {
      toast.error('Enter a valid amount');
      return;
    }

    try {
      setIsSavingBuyIn(true);
      await paymentApi.setBuyIn(leagueId, { buy_in: value }, accessToken);
      toast.success('Buy-in amount updated');
      setIsEditingBuyIn(false);
      onSettingsUpdate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update buy-in');
    } finally {
      setIsSavingBuyIn(false);
    }
  };

  // ---- Mark as paid / unpaid ----

  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const handleMarkPaid = async (userId: string) => {
    if (!accessToken || !buyInAmount) return;

    try {
      const result = await paymentApi.recordBuyIn(
        leagueId,
        { user_id: userId, amount: buyInAmount },
        accessToken,
      );
      setPayments((prev) => [...prev, result.payment]);
      toast.success('Marked as paid');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to record payment');
    }
  };

  const handleMarkAllPaid = async () => {
    if (!accessToken || !buyInAmount) return;

    const unpaidMembers = activeMembers.filter((m) => !paidUserIds.has(m.user_id));
    if (unpaidMembers.length === 0) return;

    setIsMarkingAll(true);

    for (const member of unpaidMembers) {
      try {
        const result = await paymentApi.recordBuyIn(
          leagueId,
          { user_id: member.user_id, amount: buyInAmount },
          accessToken,
        );
        setPayments((prev) => [...prev, result.payment]);
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Failed to record payment');
        break;
      }
    }

    setIsMarkingAll(false);
    toast.success('All members marked as paid');
  };

  const handleMarkUnpaid = async (paymentId: string) => {
    if (!accessToken) return;

    try {
      await paymentApi.removePayment(leagueId, paymentId, accessToken);
      setPayments((prev) => prev.filter((p) => p.id !== paymentId));
      toast.success('Payment removed');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to remove payment');
    }
  };

  // ---- Payout structure ----

  const handleRemoveEntry = (category: PayoutCategory, position: number) => {
    setPayoutEntries((prev) =>
      prev.filter((e) => !(e.category === category && e.position === position)),
    );
  };

  const handleSavePayouts = async () => {
    if (!accessToken) return;

    try {
      setIsSavingPayouts(true);
      await paymentApi.setPayouts(leagueId, { payouts: payoutEntries }, accessToken);
      toast.success('Payout structure saved');
      onSettingsUpdate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save payouts');
    } finally {
      setIsSavingPayouts(false);
    }
  };

  const hasPayoutChanges = JSON.stringify(payoutEntries) !== JSON.stringify(existingPayouts ?? []);

  const editSummary = buyInAmount != null ? `$${buyInAmount} buy-in` : 'Not set';

  return (
    <div className="mb-4 rounded-lg border border-border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-accent-foreground hover:bg-accent rounded-lg"
      >
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <span>Payments</span>
        </div>
        <div className="flex items-center gap-2">
          {!isOpen && <span className="text-xs text-muted-foreground">{editSummary}</span>}
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-border px-4 py-4 space-y-5">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <>
              {/* Buy-in Amount */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-accent-foreground">Buy-in Amount</h4>
                  {buyInAmount != null && (
                    <span className="text-xs text-muted-foreground">
                      {paidUserIds.size}/{totalRosters} paid · ${totalCollected.toFixed(2)}{' '}
                      collected
                    </span>
                  )}
                </div>

                {isEditingBuyIn ? (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={buyInInput}
                      onChange={(e) => setBuyInInput(e.target.value)}
                      className="w-28 rounded border border-input bg-card px-2 py-1 text-sm text-foreground"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSaveBuyIn();
                        }
                        if (e.key === 'Escape') setIsEditingBuyIn(false);
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleSaveBuyIn}
                      disabled={isSavingBuyIn}
                      className="rounded bg-green-600 p-1 text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingBuyIn(false)}
                      className="rounded bg-muted-hover p-1 text-accent-foreground hover:bg-muted-hover"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-medium text-foreground">
                      {buyInAmount != null ? `$${buyInAmount.toFixed(2)}` : 'Not set'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setBuyInInput(buyInAmount != null ? String(buyInAmount) : '');
                        setIsEditingBuyIn(true);
                      }}
                      className="rounded p-1 text-disabled hover:text-accent-foreground"
                      title="Edit buy-in"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Buy-in Status */}
              {buyInAmount != null && (
                <BuyInStatusSection
                  members={activeMembers}
                  paidUserIds={paidUserIds}
                  buyInPayments={buyIns}
                  buyInAmount={buyInAmount}
                  isMarkingAll={isMarkingAll}
                  onMarkPaid={handleMarkPaid}
                  onMarkUnpaid={handleMarkUnpaid}
                  onMarkAllPaid={handleMarkAllPaid}
                />
              )}

              {/* Payout Structure */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-accent-foreground">Payout Structure</h4>
                  {!showPayoutForm && (
                    <button
                      type="button"
                      onClick={() => setShowPayoutForm(true)}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-link hover:bg-primary/10"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Payout
                    </button>
                  )}
                </div>

                {showPayoutForm && (
                  <PayoutForm
                    payouts={payoutEntries}
                    buyIn={buyInAmount ?? 0}
                    totalRosters={totalRosters}
                    onAdd={(entry) => {
                      setPayoutEntries((prev) => [...prev, entry]);
                      setShowPayoutForm(false);
                    }}
                    onCancel={() => setShowPayoutForm(false)}
                    onError={(msg) => toast.error(msg)}
                  />
                )}

                {placeEntries.length > 0 && (
                  <div className="mb-3">
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <Trophy className="h-3 w-3" />
                      Place Finish
                    </div>
                    <PayoutEntryList entries={placeEntries} onRemove={handleRemoveEntry} />
                  </div>
                )}

                {pointsEntries.length > 0 && (
                  <div className="mb-3">
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <TrendingUp className="h-3 w-3" />
                      Points Finish
                    </div>
                    <PayoutEntryList entries={pointsEntries} onRemove={handleRemoveEntry} />
                  </div>
                )}

                {payoutEntries.length === 0 && !showPayoutForm && (
                  <p className="py-2 text-center text-sm text-muted-foreground">
                    No payouts configured yet.
                  </p>
                )}

                <AllocationBanner
                  payouts={payoutEntries}
                  buyIn={buyInAmount ?? 0}
                  totalRosters={totalRosters}
                />

                {/* Save payouts button */}
                {hasPayoutChanges && (
                  <button
                    type="button"
                    onClick={handleSavePayouts}
                    disabled={isSavingPayouts}
                    className="mt-2 w-full rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
                  >
                    {isSavingPayouts ? 'Saving...' : 'Save Payout Structure'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
