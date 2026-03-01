'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, Check, X, Plus, Pencil, Trash2, DollarSign, Trophy, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { paymentApi, ApiError } from '@/lib/api';
import type { LeaguePayment, LeagueMember, LeagueSettings, PayoutCategory, PayoutEntry } from '@tbdff/shared';
import { useAuth } from '@/features/auth/hooks/useAuth';

interface PaymentsSettingsProps {
  leagueId: string;
  members: LeagueMember[];
  totalRosters: number;
  settings: LeagueSettings;
  isOpen: boolean;
  onToggle: () => void;
  onSettingsUpdate: () => void;
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export function PaymentsSettings({
  leagueId,
  members,
  totalRosters,
  settings,
  isOpen,
  onToggle,
  onSettingsUpdate,
}: PaymentsSettingsProps) {
  const { accessToken } = useAuth();
  const [payments, setPayments] = useState<LeaguePayment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  // Buy-in editing
  const [isEditingBuyIn, setIsEditingBuyIn] = useState(false);
  const [buyInInput, setBuyInInput] = useState('');
  const [isSavingBuyIn, setIsSavingBuyIn] = useState(false);

  // Payout structure
  const existingPayouts = (settings as Record<string, unknown>).payouts as PayoutEntry[] | undefined;
  const [payoutEntries, setPayoutEntries] = useState<PayoutEntry[]>(existingPayouts ?? []);
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [newCategory, setNewCategory] = useState<PayoutCategory>('place');
  const [newPosition, setNewPosition] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newIsPercentage, setNewIsPercentage] = useState(false);
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

  const placeEntries = payoutEntries.filter((e) => e.category === 'place').sort((a, b) => a.position - b.position);
  const pointsEntries = payoutEntries.filter((e) => e.category === 'points').sort((a, b) => a.position - b.position);

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

  // ---- Payout structure ----

  const handleAddEntry = () => {
    const pos = parseInt(newPosition, 10);
    const val = parseFloat(newValue);
    if (isNaN(pos) || pos < 1) {
      toast.error('Enter a valid position (1, 2, 3...)');
      return;
    }
    if (isNaN(val) || val <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (newIsPercentage && val > 100) {
      toast.error('Percentage cannot exceed 100');
      return;
    }

    const duplicate = payoutEntries.find((e) => e.category === newCategory && e.position === pos);
    if (duplicate) {
      toast.error(`${newCategory === 'place' ? 'Place' : 'Points'} ${ordinal(pos)} already exists`);
      return;
    }

    setPayoutEntries((prev) => [...prev, { category: newCategory, position: pos, value: val, is_percentage: newIsPercentage }]);
    setNewPosition('');
    setNewValue('');
    setShowPayoutForm(false);
  };

  const handleRemoveEntry = (category: PayoutCategory, position: number) => {
    setPayoutEntries((prev) => prev.filter((e) => !(e.category === category && e.position === position)));
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

  const renderEntryList = (entries: PayoutEntry[]) => (
    <div className="space-y-1">
      {entries.map((entry) => (
        <div
          key={`${entry.category}-${entry.position}`}
          className="flex items-center justify-between rounded border border-border px-3 py-2"
        >
          <span className="text-sm font-medium text-foreground">
            {ordinal(entry.position)}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-success-foreground">
              {entry.is_percentage ? `${entry.value}%` : `$${entry.value.toFixed(2)}`}
            </span>
            <button
              type="button"
              onClick={() => handleRemoveEntry(entry.category, entry.position)}
              className="rounded p-1 text-disabled hover:bg-destructive hover:text-destructive-foreground"
              title="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="mb-4 rounded-lg border border-border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-accent-foreground hover:bg-accent rounded-lg"
      >
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          <span>Payments</span>
        </div>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
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
                      {paidUserIds.size}/{totalRosters} paid · ${totalCollected.toFixed(2)} collected
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
                        if (e.key === 'Enter') { e.preventDefault(); handleSaveBuyIn(); }
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
              {buyInAmount != null && activeMembers.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-accent-foreground">Buy-in Status</h4>
                  <div className="space-y-1">
                    {activeMembers.map((member) => {
                      const buyInPayment = buyIns.find((p) => p.user_id === member.user_id);
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
                                  onClick={() => handleMarkUnpaid(buyInPayment.id)}
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
                                  onClick={() => handleMarkPaid(member.user_id)}
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

                {/* Add payout form */}
                {showPayoutForm && (
                  <div className="mb-3 rounded border border-primary/20 bg-primary/10 p-3 space-y-2">
                    <div className="flex gap-2">
                      <select
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value as PayoutCategory)}
                        className="rounded border border-input bg-card px-2 py-1.5 text-sm text-foreground"
                      >
                        <option value="place">Place Finish</option>
                        <option value="points">Points Finish</option>
                      </select>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="Position (1, 2, 3...)"
                        value={newPosition}
                        onChange={(e) => setNewPosition(e.target.value)}
                        className="w-full flex-1 rounded border border-input bg-card px-2 py-1.5 text-sm text-foreground"
                      />
                    </div>
                    <div className="flex gap-2">
                      <div className="flex items-center gap-1 flex-1">
                        <span className="text-sm text-muted-foreground">
                          {newIsPercentage ? '%' : '$'}
                        </span>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="Amount"
                          value={newValue}
                          onChange={(e) => setNewValue(e.target.value)}
                          className="w-full rounded border border-input bg-card px-2 py-1.5 text-sm text-foreground"
                        />
                      </div>
                      <select
                        value={newIsPercentage ? 'percent' : 'dollar'}
                        onChange={(e) => setNewIsPercentage(e.target.value === 'percent')}
                        className="rounded border border-input bg-card px-2 py-1.5 text-sm text-foreground"
                      >
                        <option value="dollar">$</option>
                        <option value="percent">%</option>
                      </select>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setShowPayoutForm(false);
                          setNewPosition('');
                          setNewValue('');
                        }}
                        className="rounded px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleAddEntry}
                        className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-hover"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}

                {/* Place Finish */}
                {placeEntries.length > 0 && (
                  <div className="mb-3">
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <Trophy className="h-3 w-3" />
                      Place Finish
                    </div>
                    {renderEntryList(placeEntries)}
                  </div>
                )}

                {/* Points Finish */}
                {pointsEntries.length > 0 && (
                  <div className="mb-3">
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <TrendingUp className="h-3 w-3" />
                      Points Finish
                    </div>
                    {renderEntryList(pointsEntries)}
                  </div>
                )}

                {payoutEntries.length === 0 && !showPayoutForm && (
                  <p className="py-2 text-center text-sm text-muted-foreground">
                    No payouts configured yet.
                  </p>
                )}

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
