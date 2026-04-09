'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ArrowLeftRight, ClipboardList, Activity, Users2, BarChart2, Trophy, GitBranch, type LucideIcon } from 'lucide-react';
import type { LeagueStatus } from '@tbdff/shared';
import { useActionsPanel, type ActionsTab } from '@/features/actions/context/ActionsPanelContext';

interface LeagueNavBarProps {
  leagueId: string;
  leagueStatus: LeagueStatus;
}

type NavTab =
  | { kind: 'link'; label: string; href: string; icon: LucideIcon; show: boolean }
  | { kind: 'action'; label: string; actionTab: ActionsTab; icon: LucideIcon; show: boolean };

export function LeagueNavBar({ leagueId, leagueStatus }: LeagueNavBarProps) {
  const pathname = usePathname();
  const basePath = `/leagues/${leagueId}`;
  const { isOpen, activeTab, openPanel } = useActionsPanel();

  const showWaivers = leagueStatus === 'reg_season' || leagueStatus === 'post_season' || leagueStatus === 'complete';
  const showActivity = showWaivers;
  const showScores = leagueStatus === 'reg_season' || leagueStatus === 'post_season' || leagueStatus === 'complete';
  const showStandings = showScores;
  const showBracket = leagueStatus === 'post_season' || leagueStatus === 'complete';

  const tabs: NavTab[] = ([
    { kind: 'link',   label: 'Home',      href: basePath,                  icon: LayoutDashboard, show: true },
    { kind: 'action', label: 'Trades',    actionTab: 'trades',             icon: ArrowLeftRight,  show: true },
    { kind: 'action', label: 'Waivers',   actionTab: 'waivers',            icon: ClipboardList,   show: showWaivers },
    { kind: 'action', label: 'Roster',    actionTab: 'lineup',             icon: Users2,          show: true },
    { kind: 'link',   label: 'Scores',    href: `${basePath}/scores`,      icon: BarChart2,       show: showScores },
    { kind: 'link',   label: 'Standings', href: `${basePath}/standings`,   icon: Trophy,          show: showStandings },
    { kind: 'link',   label: 'Bracket',   href: `${basePath}/bracket`,     icon: GitBranch,       show: showBracket },
    { kind: 'link',   label: 'Activity',  href: `${basePath}/transactions`,icon: Activity,        show: showActivity },
  ] satisfies NavTab[]).filter((t) => t.show);

  return (
    <nav className="flex gap-2 overflow-x-auto pb-1">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const baseClasses =
          'flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors';

        if (tab.kind === 'link') {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={`link-${tab.href}`}
              href={tab.href}
              className={`${baseClasses} ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-accent-foreground hover:bg-muted-hover'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </Link>
          );
        }

        const isActive = isOpen && activeTab === tab.actionTab;
        return (
          <button
            key={`action-${tab.actionTab}`}
            type="button"
            onClick={() => openPanel(tab.actionTab)}
            className={`${baseClasses} ${
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-accent-foreground hover:bg-muted-hover'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
