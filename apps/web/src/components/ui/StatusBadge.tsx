import type { ReactNode } from 'react';

export type StatusBadgeVariant =
  | 'live'
  | 'setup'
  | 'complete'
  | 'success'
  | 'warning'
  | 'info'
  | 'neutral'
  | 'urgent';

interface StatusBadgeProps {
  variant: StatusBadgeVariant;
  children: ReactNode;
  className?: string;
}

const variantClasses: Record<StatusBadgeVariant, string> = {
  live: 'bg-neon-cyan/20 text-neon-cyan',
  setup: 'bg-neon-orange/20 text-neon-orange',
  complete: 'bg-muted text-muted-foreground',
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  info: 'bg-neon-purple/20 text-neon-purple',
  neutral: 'bg-muted text-accent-foreground',
  urgent: 'bg-neon-rose/20 text-neon-rose',
};

export function StatusBadge({ variant, children, className = '' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
