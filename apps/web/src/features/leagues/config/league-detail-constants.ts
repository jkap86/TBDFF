export const draftTypeLabels: Record<string, string> = {
  snake: 'Snake',
  linear: 'Linear',
  '3rr': '3rd Round Reversal',
  auction: 'Auction',
};

export const statusColors: Record<string, string> = {
  pre_draft: 'bg-muted text-accent-foreground',
  drafting: 'bg-primary/10 text-primary',
  in_season: 'bg-success text-success-foreground',
  complete: 'bg-muted text-muted-foreground',
};

export const statusLabels: Record<string, string> = {
  pre_draft: 'Pre-Draft',
  drafting: 'Drafting',
  in_season: 'In Season',
  complete: 'Complete',
};

export const roleColors: Record<string, string> = {
  commissioner: 'bg-primary/10 text-primary',
  member: 'bg-muted text-muted-foreground',
  spectator: 'bg-warning text-warning-foreground',
};

export const draftStatusColors: Record<string, string> = {
  pre_draft: 'bg-warning text-warning-foreground',
  drafting: 'bg-primary/10 text-primary',
  complete: 'bg-success text-success-foreground',
};

export const draftStatusLabels: Record<string, string> = {
  pre_draft: 'Setup',
  drafting: 'In Progress',
  complete: 'Complete',
};

export const playerPoolLabel = (pt: number) =>
  pt === 2 ? 'Veteran Draft' : pt === 1 ? 'Rookie Draft' : 'Draft';
