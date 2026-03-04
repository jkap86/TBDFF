'use client';

import { useState } from 'react';
import { ChevronDown, MessageSquare, Pencil, Check, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { paymentApi, ApiError } from '@/lib/api';
import { roleColors } from '@/features/leagues/config/league-detail-constants';
import type { League, LeagueMember, Roster, LeaguePayment } from '@tbdff/shared';

interface LeagueDuesCardProps {
  league: League;
  members: LeagueMember[];
  rosters: Roster[];
  payments: LeaguePayment[];
  leagueId: string;
  currentUserId: string | undefined;
  isCommissioner: boolean;
  accessToken: string | null;
  onStartDM: (memberId: string) => void;
  onAssignRoster: (rosterId: number, userId: string) => Promise<void>;
}

export function LeagueDuesCard({
  league,
  members,
  rosters,
  payments,
  leagueId,
  currentUserId,
  isCommissioner,
  accessToken,
  onStartDM,
  onAssignRoster,
}: LeagueDuesCardProps) {
  const queryClient = useQueryClient();
  const [isDuesEditing, setIsDuesEditing] = useState(false);
  const [isDuesExpanded, setIsDuesExpanded] = useState<boolean | null>(null);
  const [isSpectatorsExpanded, setIsSpectatorsExpanded] = useState(false);

  const buyIn = (league.settings as Record<string, unknown>).buy_in as number | undefined;
  const hasBuyIn = buyIn != null && buyIn > 0;
  const buyIns = payments.filter((p) => p.type === 'buy_in');
  const paidBuyInUserIds = new Set(buyIns.map((p) => p.user_id));
  const rosterOwnerIds = new Set(rosters.map((r) => r.owner_id).filter(Boolean));
  const isMemberPaid = (userId: string) =>
    hasBuyIn ? paidBuyInUserIds.has(userId) : rosterOwnerIds.has(userId);
  const activeMembers = members.filter((m) => m.role !== 'spectator');
  const spectators = members.filter((m) => m.role === 'spectator');
  const emptyRosters = rosters.filter((r) => !r.owner_id).sort((a, b) => a.roster_id - b.roster_id);
  const totalRosters = rosters.length;
  const paidCount = activeMembers.filter((m) => isMemberPaid(m.user_id)).length;
  const allPaid = paidCount === totalRosters;
  const duesExpanded = isDuesExpanded ?? !allPaid;

  const handleMarkPaid = async (userId: string) => {
    if (!accessToken || !buyIn) return;
    try {
      const result = await paymentApi.recordBuyIn(leagueId, { user_id: userId, amount: buyIn }, accessToken);
      queryClient.setQueryData(['payments', leagueId], (old: any) =>
        old ? { ...old, payments: [...old.payments, result.payment] } : old,
      );
      toast.success('Marked as paid');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to record payment');
    }
  };

  const handleMarkUnpaid = async (userId: string) => {
    if (!accessToken) return;
    const payment = buyIns.find((p) => p.user_id === userId);
    if (!payment) return;
    try {
      await paymentApi.removePayment(leagueId, payment.id, accessToken);
      queryClient.setQueryData(['payments', leagueId], (old: any) =>
        old ? { ...old, payments: old.payments.filter((p: any) => p.id !== payment.id) } : old,
      );
      toast.success('Payment removed');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to remove payment');
    }
  };

  return (
    <div className="rounded-lg bg-card p-6 shadow">
      <div className={`flex items-center justify-between ${duesExpanded ? 'mb-4' : ''}`}>
        <button
          onClick={() => setIsDuesExpanded((prev) => (prev ?? !allPaid) ? false : true)}
          className="flex flex-1 items-center gap-3"
        >
          <ChevronDown
            className={`h-5 w-5 text-muted-foreground transition-transform ${duesExpanded ? '' : '-rotate-90'}`}
          />
          <h2 className="text-xl font-bold text-foreground">
            Dues {hasBuyIn ? `- $${buyIn}` : '- Free'}
          </h2>
          <span className="text-sm text-muted-foreground">
            {paidCount}/{totalRosters} Paid
          </span>
        </button>
        {isCommissioner && duesExpanded && (
          <button
            onClick={() => setIsDuesEditing((prev) => !prev)}
            className="rounded p-1.5 text-disabled hover:bg-muted hover:text-accent-foreground"
            title={isDuesEditing ? 'Done editing' : 'Edit dues'}
          >
            {isDuesEditing ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Active members */}
      {duesExpanded && (<>
      <div className="space-y-2">
        {activeMembers.map((member) => {
          const paid = isMemberPaid(member.user_id);
          return (
            <div
              key={member.id}
              className="flex items-center justify-between rounded border border-border p-3"
            >
              <div>
                <p className="font-medium text-foreground">{member.username}</p>
                {member.display_name && (
                  <p className="text-sm text-muted-foreground">{member.display_name}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {member.user_id !== currentUserId && !isDuesEditing && (
                  <button
                    onClick={() => onStartDM(member.user_id)}
                    className="rounded p-1.5 text-disabled hover:bg-muted hover:text-link"
                    title={`Message ${member.username}`}
                  >
                    <MessageSquare className="h-4 w-4" />
                  </button>
                )}
                {isDuesEditing && hasBuyIn ? (
                  paid ? (
                    <button
                      onClick={() => handleMarkUnpaid(member.user_id)}
                      className="flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-xs font-medium text-success-foreground hover:bg-destructive hover:text-destructive-foreground"
                      title="Remove payment"
                    >
                      Paid <X className="h-3 w-3" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleMarkPaid(member.user_id)}
                      className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-success hover:text-success-foreground"
                      title="Mark as paid"
                    >
                      Unpaid <Check className="h-3 w-3" />
                    </button>
                  )
                ) : (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      paid
                        ? 'bg-success text-success-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {paid ? 'Paid' : 'Unpaid'}
                  </span>
                )}
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium uppercase ${roleColors[member.role]}`}
                >
                  {member.role}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty rosters */}
      {emptyRosters.length > 0 && (
        <div className="mt-4 space-y-2">
          {emptyRosters.map((roster) => (
            <div
              key={roster.roster_id}
              className="flex items-center justify-between rounded border border-dashed border-border p-3"
            >
              <p className="text-sm text-muted-foreground">Roster {roster.roster_id}</p>
              {isDuesEditing && spectators.length > 0 ? (
                <select
                  defaultValue=""
                  onChange={async (e) => {
                    const userId = e.target.value;
                    if (!userId) return;
                    const member = spectators.find((m) => m.user_id === userId);
                    try {
                      await onAssignRoster(roster.roster_id, userId);
                      toast.success(`Assigned ${member?.username ?? 'user'} to Roster ${roster.roster_id}`);
                    } catch {
                      toast.error('Failed to assign roster');
                    }
                    e.target.value = '';
                  }}
                  className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                >
                  <option value="" disabled>Assign spectator...</option>
                  {spectators.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.display_name || m.username}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Empty
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Spectators */}
      {spectators.length > 0 && (
        <div className="mt-5">
          <button
            onClick={() => setIsSpectatorsExpanded((prev) => !prev)}
            className="mb-2 flex items-center gap-1.5"
          >
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${isSpectatorsExpanded ? '' : '-rotate-90'}`}
            />
            <h3 className="text-sm font-semibold text-muted-foreground">
              Spectators ({spectators.length})
            </h3>
          </button>
          {isSpectatorsExpanded && (
          <div className="space-y-2">
            {spectators.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between rounded border border-border p-3"
              >
                <div>
                  <p className="font-medium text-foreground">{member.username}</p>
                  {member.display_name && (
                    <p className="text-sm text-muted-foreground">{member.display_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {member.user_id !== currentUserId && !isDuesEditing && (
                    <button
                      onClick={() => onStartDM(member.user_id)}
                      className="rounded p-1.5 text-disabled hover:bg-muted hover:text-link"
                      title={`Message ${member.username}`}
                    >
                      <MessageSquare className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      )}
      </>)}
    </div>
  );
}
