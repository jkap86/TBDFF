export const draftTypeLabels: Record<string, string> = {
  snake: 'Snake',
  linear: 'Linear',
  '3rr': '3rd Round Reversal',
  auction: 'Auction',
};

export const statusColors: Record<string, string> = {
  not_filled: 'bg-muted text-accent-foreground',
  offseason: 'bg-neon-cyan/15 text-neon-cyan',
  reg_season: 'bg-success text-success-foreground',
  post_season: 'bg-warning text-warning-foreground',
  complete: 'bg-muted text-muted-foreground',
};

export const statusLabels: Record<string, string> = {
  not_filled: 'Not Filled',
  offseason: 'Offseason',
  reg_season: 'Regular Season',
  post_season: 'Post Season',
  complete: 'Complete',
};

export const roleColors: Record<string, string> = {
  commissioner: 'bg-neon-cyan/15 text-neon-cyan',
  member: 'bg-muted text-muted-foreground',
  spectator: 'bg-warning text-warning-foreground',
};

export const draftStatusColors: Record<string, string> = {
  pre_draft: 'bg-warning text-warning-foreground',
  drafting: 'bg-neon-cyan/15 text-neon-cyan',
  complete: 'bg-success text-success-foreground',
};

export const draftStatusLabels: Record<string, string> = {
  pre_draft: 'Setup',
  drafting: 'In Progress',
  complete: 'Complete',
};

export const playerPoolLabel = (pt: number) =>
  pt === 2 ? 'Veteran Draft' : pt === 1 ? 'Rookie Draft' : 'Draft';
