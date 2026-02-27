'use client';

import { useState, useEffect, useCallback } from 'react';
import { DollarSign, Check, X, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { paymentApi, ApiError } from '@/lib/api';
import type { LeaguePayment, LeagueMember, LeagueSettings } from '@tbdff/shared';
import { useAuth } from '@/features/auth/hooks/useAuth';

interface PaymentsCardProps {
  leagueId: string;
  members: LeagueMember[];
  settings: LeagueSettings;
  isCommissioner: boolean;
  onSettingsUpdate?: () => void;
}

export function PaymentsCard({ leagueId, members, settings, isCommissioner, onSettingsUpdate }: PaymentsCardProps) {
  const { accessToken } = useAuth();
  const [payments, setPayments] = useState<LeaguePayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Buy-in editing
  const [isEditingBuyIn, setIsEditingBuyIn] = useState(false);
  const [buyInInput, setBuyInInput] = useState('');
  const [isSavingBuyIn, setIsSavingBuyIn] = useState(false);

  // Payout form
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [payoutUserId, setPayoutUserId] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutNote, setPayoutNote] = useState('');
  const [isSubmittingPayout, setIsSubmittingPayout] = useState(false);

  const buyInAmount = (settings as any).buy_in as number | undefined;

  const fetchPayments = useCallback(async () => {
    if (!accessToken) return;
    try {
      const result = await paymentApi.getPayments(leagueId, accessToken);
      setPayments(result.payments);
    } catch {
      // Non-fatal on initial load
    } finally {
      setIsLoading(false);
    }
  }, [leagueId, accessToken]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const buyIns = payments.filter((p) => p.type === 'buy_in');
  const payouts = payments.filter((p) => p.type === 'payout');
  const paidUserIds = new Set(buyIns.map((p) => p.user_id));
  const activeMembers = members.filter((m) => m.role !== 'spectator');

  const totalCollected = buyIns.reduce((sum, p) => sum + p.amount, 0);
  const totalPaidOut = payouts.reduce((sum, p) => sum + p.amount, 0);

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
      onSettingsUpdate?.();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update buy-in');
    } finally {
      setIsSavingBuyIn(false);
    }
  };

  // ---- Mark as paid / unpaid ----

  const handleMarkPaid = async (userId: string) => {
    if (!accessToken || !buyInAmount) return;

    try {
      const result = await paymentApi.recordBuyIn(leagueId, { user_id: userId, amount: buyInAmount }, accessToken);
      setPayments((prev) => [...prev, result.payment]);
      toast.success('Marked as paid');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to record payment');
    }
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

  // ---- Payouts ----

  const handleAddPayout = async () => {
    if (!accessToken) return;
    const amount = parseFloat(payoutAmount);
    if (!payoutUserId || isNaN(amount) || amount <= 0) {
      toast.error('Select a member and enter a valid amount');
      return;
    }

    try {
      setIsSubmittingPayout(true);
      const result = await paymentApi.recordPayout(
        leagueId,
        { user_id: payoutUserId, amount, note: payoutNote || undefined },
        accessToken,
      );
      setPayments((prev) => [...prev, result.payment]);
      setPayoutUserId('');
      setPayoutAmount('');
      setPayoutNote('');
      setShowPayoutForm(false);
      toast.success('Payout recorded');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to record payout');
    } finally {
      setIsSubmittingPayout(false);
    }
  };

  const handleRemovePayout = async (paymentId: string) => {
    if (!accessToken) return;

    try {
      await paymentApi.removePayment(leagueId, paymentId, accessToken);
      setPayments((prev) => prev.filter((p) => p.id !== paymentId));
      toast.success('Payout removed');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to remove payout');
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow">
        <div className="flex items-center gap-3 mb-2">
          <DollarSign className="h-5 w-5 text-green-600" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Payments</h2>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white dark:bg-gray-800 p-6 shadow">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <DollarSign className="h-5 w-5 text-green-600" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Payments</h2>
        </div>
      </div>

      {/* Buy-in Amount */}
      <div className="mb-4 rounded border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Buy-in</p>
            {isEditingBuyIn ? (
              <div className="mt-1 flex items-center gap-2">
                <span className="text-gray-500 dark:text-gray-400">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={buyInInput}
                  onChange={(e) => setBuyInInput(e.target.value)}
                  className="w-28 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-sm text-gray-900 dark:text-white"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveBuyIn();
                    if (e.key === 'Escape') setIsEditingBuyIn(false);
                  }}
                />
                <button
                  onClick={handleSaveBuyIn}
                  disabled={isSavingBuyIn}
                  className="rounded bg-green-600 p-1 text-white hover:bg-green-700 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setIsEditingBuyIn(false)}
                  className="rounded bg-gray-300 dark:bg-gray-600 p-1 text-gray-700 dark:text-gray-300 hover:bg-gray-400 dark:hover:bg-gray-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <p className="text-lg font-medium text-gray-900 dark:text-white">
                {buyInAmount != null ? `$${buyInAmount.toFixed(2)}` : 'Not set'}
                {isCommissioner && (
                  <button
                    onClick={() => {
                      setBuyInInput(buyInAmount != null ? String(buyInAmount) : '');
                      setIsEditingBuyIn(true);
                    }}
                    className="ml-2 inline-flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    title="Edit buy-in"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </p>
            )}
          </div>
          {buyInAmount != null && (
            <div className="text-right text-sm">
              <p className="text-gray-500 dark:text-gray-400">
                {paidUserIds.size}/{activeMembers.length} paid
              </p>
              <p className="font-medium text-green-600">${totalCollected.toFixed(2)} collected</p>
            </div>
          )}
        </div>
      </div>

      {/* Buy-in Status */}
      {buyInAmount != null && activeMembers.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Buy-in Status
          </h3>
          <div className="space-y-1">
            {activeMembers.map((member) => {
              const buyInPayment = buyIns.find((p) => p.user_id === member.user_id);
              const isPaid = !!buyInPayment;

              return (
                <div
                  key={member.user_id}
                  className="flex items-center justify-between rounded border border-gray-200 dark:border-gray-700 px-3 py-2"
                >
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {member.display_name || member.username}
                  </span>
                  <div className="flex items-center gap-2">
                    {isPaid ? (
                      <>
                        <span className="rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                          Paid
                        </span>
                        {isCommissioner && (
                          <button
                            onClick={() => handleMarkUnpaid(buyInPayment.id)}
                            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                            title="Remove payment"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                          Unpaid
                        </span>
                        {isCommissioner && (
                          <button
                            onClick={() => handleMarkPaid(member.user_id)}
                            className="rounded p-1 text-gray-400 hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-900/20 dark:hover:text-green-400"
                            title="Mark as paid"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Payouts */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Payouts
          </h3>
          {isCommissioner && !showPayoutForm && (
            <button
              onClick={() => setShowPayoutForm(true)}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Payout
            </button>
          )}
        </div>

        {totalPaidOut > 0 && (
          <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
            Total paid out: <span className="font-medium text-green-600">${totalPaidOut.toFixed(2)}</span>
          </p>
        )}

        {/* Payout form */}
        {showPayoutForm && (
          <div className="mb-3 rounded border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10 p-3 space-y-2">
            <select
              value={payoutUserId}
              onChange={(e) => setPayoutUserId(e.target.value)}
              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-sm text-gray-900 dark:text-white"
            >
              <option value="">Select member...</option>
              {activeMembers.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name || m.username}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <div className="flex items-center gap-1 flex-1">
                <span className="text-sm text-gray-500 dark:text-gray-400">$</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Amount"
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(e.target.value)}
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-sm text-gray-900 dark:text-white"
                />
              </div>
              <input
                type="text"
                placeholder="Note (e.g. 1st place)"
                value={payoutNote}
                onChange={(e) => setPayoutNote(e.target.value)}
                maxLength={200}
                className="flex-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-sm text-gray-900 dark:text-white"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowPayoutForm(false);
                  setPayoutUserId('');
                  setPayoutAmount('');
                  setPayoutNote('');
                }}
                className="rounded px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleAddPayout}
                disabled={isSubmittingPayout}
                className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isSubmittingPayout ? 'Saving...' : 'Save Payout'}
              </button>
            </div>
          </div>
        )}

        {/* Payout list */}
        {payouts.length > 0 ? (
          <div className="space-y-1">
            {payouts.map((payout) => (
              <div
                key={payout.id}
                className="flex items-center justify-between rounded border border-gray-200 dark:border-gray-700 px-3 py-2"
              >
                <div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {payout.username}
                  </span>
                  {payout.note && (
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      — {payout.note}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-green-600">
                    ${payout.amount.toFixed(2)}
                  </span>
                  {isCommissioner && (
                    <button
                      onClick={() => handleRemovePayout(payout.id)}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                      title="Remove payout"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-2 text-center text-sm text-gray-500 dark:text-gray-400">
            No payouts recorded yet.
          </p>
        )}
      </div>
    </div>
  );
}
