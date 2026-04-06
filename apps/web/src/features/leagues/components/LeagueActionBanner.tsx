'use client';

import Link from 'next/link';
import { Zap, AlertCircle, Clock, Trophy, Calendar } from 'lucide-react';
import { statusLabels } from '@/features/leagues/config/league-detail-constants';
import type { League, Draft, Matchup, LeagueMember, Roster, LeaguePayment } from '@tbdff/shared';

interface LeagueActionBannerProps {
  league: League;
  leagueId: string;
  drafts: Draft[];
  matchups: Matchup[];
  members: LeagueMember[];
  rosters: Roster[];
  payments: LeaguePayment[];
  currentUserId: string | undefined;
}

interface BannerContent {
  icon: React.ElementType;
  text: string;
  cta?: { label: string; href: string };
  variant: 'urgent' | 'action' | 'info';
}

function getBannerContent({
  league,
  leagueId,
  drafts,
  matchups,
  members,
  rosters,
  payments,
  currentUserId,
}: LeagueActionBannerProps): BannerContent {
  // Priority 1: Active derby - someone's picking
  const activeDerbyDraft = drafts.find(
    (d) => (d.status === 'pre_draft' || d.status === 'drafting') && (d.metadata?.derby as any)?.status === 'active',
  );
  if (activeDerbyDraft) {
    const derby = activeDerbyDraft.metadata?.derby as any;
    const currentPicker = derby.derby_order?.[derby.current_pick_index];
    const pickerMember = currentPicker ? members.find((m) => m.user_id === currentPicker.user_id) : null;
    const isMyPick = currentPicker?.user_id === currentUserId;
    return {
      icon: Zap,
      text: isMyPick ? "It's your turn to pick!" : `Derby in progress - ${pickerMember?.display_name || pickerMember?.username || 'Picking...'}'s turn`,
      cta: { label: 'Enter Draft Room', href: `/leagues/${leagueId}/draft?draftId=${activeDerbyDraft.id}` },
      variant: 'urgent',
    };
  }

  // Priority 2: Draft in progress
  const draftingDraft = drafts.find((d) => d.status === 'drafting');
  if (draftingDraft) {
    return {
      icon: Zap,
      text: 'Draft is live!',
      cta: { label: 'Enter Draft Room', href: `/leagues/${leagueId}/draft?draftId=${draftingDraft.id}` },
      variant: 'urgent',
    };
  }

  // Priority 3: Current user hasn't paid buy-in
  const buyIn = (league.settings as Record<string, unknown>)?.buy_in as number | undefined;
  if (buyIn && buyIn > 0 && currentUserId && league.status !== 'not_filled') {
    const hasPaid = payments.some((p) => p.type === 'buy_in' && p.user_id === currentUserId);
    if (!hasPaid) {
      return {
        icon: AlertCircle,
        text: `You haven't paid your $${buyIn} buy-in`,
        variant: 'action',
      };
    }
  }

  // Priority 4: Pre-draft setup
  const preDraft = drafts.find((d) => d.status === 'pre_draft');
  if (preDraft && league.status === 'offseason') {
    return {
      icon: Clock,
      text: 'Draft setup in progress',
      cta: { label: 'Enter Draft Room', href: `/leagues/${leagueId}/draft?draftId=${preDraft.id}` },
      variant: 'info',
    };
  }

  // Priority 5: Regular season - show current matchup
  if (league.status === 'reg_season' || league.status === 'post_season') {
    const currentUserRosterId = rosters.find((r) => r.owner_id === currentUserId)?.roster_id;
    if (currentUserRosterId && matchups.length > 0) {
      const weeks = [...new Set(matchups.map((m) => m.week))].sort((a, b) => a - b);
      const currentWeek = (league.settings as any)?.leg ?? weeks[0] ?? 1;
      const myMatchup = matchups.find((m) => m.week === currentWeek && m.roster_id === currentUserRosterId);
      if (myMatchup && myMatchup.matchup_id > 0) {
        const opponent = matchups.find(
          (m) => m.week === currentWeek && m.matchup_id === myMatchup.matchup_id && m.roster_id !== currentUserRosterId,
        );
        if (opponent) {
          const opponentRoster = rosters.find((r) => r.roster_id === opponent.roster_id);
          const opponentMember = opponentRoster?.owner_id ? members.find((m) => m.user_id === opponentRoster.owner_id) : null;
          const opponentName = opponentMember?.display_name || opponentMember?.username || `Team ${opponent.roster_id}`;
          return {
            icon: Calendar,
            text: `Week ${currentWeek}: You vs ${opponentName}`,
            variant: 'info',
          };
        }
      }
    }
  }

  // Priority 6: Not filled
  if (league.status === 'not_filled') {
    const filledCount = rosters.filter((r) => r.owner_id).length;
    return {
      icon: AlertCircle,
      text: `${filledCount} of ${league.total_rosters} spots filled`,
      variant: 'action',
    };
  }

  // Fallback: Show status
  return {
    icon: Trophy,
    text: statusLabels[league.status] || league.status,
    variant: 'info',
  };
}

export function LeagueActionBanner(props: LeagueActionBannerProps) {
  const banner = getBannerContent(props);
  const Icon = banner.icon;

  const variantClasses = {
    urgent: 'shimmer-border border-neon-cyan/30 bg-neon-cyan/5',
    action: 'glow-border border-warning/30 bg-warning/5',
    info: 'border-border bg-card glass-subtle',
  };

  return (
    <div className={`flex items-center justify-between rounded-lg border px-4 py-3 ${variantClasses[banner.variant]}`}>
      <div className="flex items-center gap-3">
        <Icon className={`h-4 w-4 flex-shrink-0 ${
          banner.variant === 'urgent' ? 'text-neon-cyan' : banner.variant === 'action' ? 'text-warning' : 'text-muted-foreground'
        }`} />
        <span className={`text-sm font-medium ${
          banner.variant === 'urgent' ? 'text-neon-cyan' : 'text-foreground'
        }`}>
          {banner.text}
        </span>
      </div>
      {banner.cta && (
        <Link
          href={banner.cta.href}
          className={`flex-shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            banner.variant === 'urgent'
              ? 'bg-primary text-primary-foreground hover:bg-primary-hover'
              : 'bg-muted text-accent-foreground hover:bg-muted-hover'
          }`}
        >
          {banner.cta.label}
        </Link>
      )}
    </div>
  );
}
