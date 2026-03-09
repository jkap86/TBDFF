'use client';

import Link from 'next/link';
import { Trophy, Users, ArrowLeftRight, Search, Gavel } from 'lucide-react';
import { useAuth } from '@/features/auth/hooks/useAuth';

const navItems = [
  { href: '/leagues', icon: Trophy, label: 'Leagues', iconColor: 'text-neon-cyan' },
  { href: '/players', icon: Search, label: 'Players', iconColor: 'text-neon-purple' },
  { href: '/leaguemates', icon: Users, label: 'Leaguemates', iconColor: 'text-neon-orange' },
  { href: '/transactions', icon: ArrowLeftRight, label: 'Transactions', iconColor: 'text-success-foreground' },
  { href: '/drafts', icon: Gavel, label: 'Drafts', iconColor: 'text-neon-magenta' },
];

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-1 text-3xl font-bold font-heading gradient-text glow-text-strong">
        {user?.display_username || user?.username}
      </h1>
      <p className="mb-8 text-sm text-muted-foreground">Welcome back</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {navItems.map(({ href, icon: Icon, label, iconColor }) => (
          <Link
            key={href}
            href={href}
            className="rounded-lg border border-border bg-card p-6 shadow hover:shadow-md transition-shadow text-left glow-border"
          >
            <div className="flex items-center gap-3">
              <Icon className={`h-5 w-5 ${iconColor}`} />
              <h3 className="text-lg font-bold font-heading text-foreground">{label}</h3>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
