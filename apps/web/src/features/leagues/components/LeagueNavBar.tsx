'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ArrowLeftRight, ClipboardList, Activity } from 'lucide-react';
import type { LeagueStatus } from '@tbdff/shared';

interface LeagueNavBarProps {
  leagueId: string;
  leagueStatus: LeagueStatus;
}

export function LeagueNavBar({ leagueId, leagueStatus }: LeagueNavBarProps) {
  const pathname = usePathname();
  const basePath = `/leagues/${leagueId}`;

  const showWaivers = leagueStatus === 'reg_season' || leagueStatus === 'post_season' || leagueStatus === 'complete';
  const showActivity = showWaivers;

  const tabs = [
    { label: 'Home', href: basePath, icon: LayoutDashboard, show: true },
    { label: 'Trades', href: `${basePath}/trades`, icon: ArrowLeftRight, show: true },
    { label: 'Waivers', href: `${basePath}/waivers`, icon: ClipboardList, show: showWaivers },
    { label: 'Activity', href: `${basePath}/transactions`, icon: Activity, show: showActivity },
  ].filter((t) => t.show);

  return (
    <nav className="flex gap-2 overflow-x-auto pb-1">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-accent-foreground hover:bg-muted-hover'
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
