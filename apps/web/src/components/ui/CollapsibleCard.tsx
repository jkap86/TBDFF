'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ReactNode } from 'react';

interface CollapsibleCardProps {
  title: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  rightSlot?: ReactNode;
  variant?: 'primary' | 'subtle';
  className?: string;
}

export function CollapsibleCard({
  title,
  expanded,
  onToggle,
  children,
  rightSlot,
  variant = 'subtle',
  className = '',
}: CollapsibleCardProps) {
  const containerClass =
    variant === 'primary'
      ? 'rounded-lg bg-card glass-strong glow-border shadow'
      : 'rounded-lg bg-card glass-subtle border border-border shadow';

  return (
    <div className={`${containerClass} ${className}`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-3">
          {typeof title === 'string' ? (
            <h3 className="text-sm font-heading font-bold uppercase tracking-wide text-accent-foreground">
              {title}
            </h3>
          ) : (
            title
          )}
        </div>
        <div className="flex items-center gap-2">
          {rightSlot}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>
      {expanded && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
