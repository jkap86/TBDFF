'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

interface LeagueSubPageHeaderProps {
  leagueId: string;
  title: string;
  badge?: ReactNode;
  actions?: ReactNode;
}

export function LeagueSubPageHeader({ leagueId, title, badge, actions }: LeagueSubPageHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Link
          href={`/leagues/${leagueId}`}
          className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-accent-foreground transition-colors"
          title="Back to league"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold gradient-text font-heading">{title}</h1>
        {badge}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
