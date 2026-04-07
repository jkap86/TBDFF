import type { Player } from '@tbdff/shared';

function positionChipClass(position: string | null): string {
  switch (position) {
    case 'QB': return 'bg-neon-cyan/20 text-neon-cyan';
    case 'RB': return 'bg-neon-orange/20 text-neon-orange';
    case 'WR': return 'bg-neon-magenta/20 text-neon-magenta';
    case 'TE': return 'bg-neon-purple/20 text-neon-purple';
    case 'K':
    case 'DEF': return 'bg-muted text-accent-foreground';
    default: return 'bg-muted text-muted-foreground';
  }
}

const INJURY_CONFIG: Record<string, { label: string; color: string }> = {
  Out:        { label: 'O',  color: 'bg-destructive text-destructive-foreground' },
  Doubtful:   { label: 'D',  color: 'bg-neon-rose/20 text-neon-rose' },
  Questionable:{ label: 'Q', color: 'bg-neon-orange/20 text-neon-orange' },
  Probable:   { label: 'P',  color: 'bg-muted text-muted-foreground' },
};

const SLOT_LABELS: Record<string, string> = {
  QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', K: 'K', DEF: 'DEF',
  FLEX: 'FLEX', SUPER_FLEX: 'SF', REC_FLEX: 'REC', WRRB_FLEX: 'W/R', BN: 'BN', IR: 'IR',
};

interface PlayerCardProps {
  player: Player | null;
  slotLabel: string;
  editMode?: boolean;
  isSelected?: boolean;
  isSwappable?: boolean;
  onClick?: () => void;
}

export function PlayerCard({
  player,
  slotLabel,
  editMode = false,
  isSelected = false,
  isSwappable = false,
  onClick,
}: PlayerCardProps) {
  const displaySlot = SLOT_LABELS[slotLabel] ?? slotLabel;

  if (!player) {
    return (
      <div className="flex items-center gap-3 py-3 px-1">
        <span className="flex h-7 w-9 items-center justify-center rounded text-xs font-bold bg-muted/50 text-disabled">
          {displaySlot}
        </span>
        <span className="flex-1 rounded border border-dashed border-border px-3 py-2 text-sm text-disabled italic">
          Empty
        </span>
      </div>
    );
  }

  const injuryCfg = player.injury_status ? INJURY_CONFIG[player.injury_status] : null;
  const posClass = positionChipClass(player.position);

  return (
    <button
      type="button"
      disabled={!editMode && !onClick}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left transition-all ${
        editMode
          ? isSelected
            ? 'ring-2 ring-neon-cyan bg-neon-cyan/5'
            : isSwappable
              ? 'hover:bg-muted/60 cursor-pointer ring-1 ring-border'
              : 'hover:bg-muted/40 cursor-pointer'
          : 'cursor-default'
      }`}
    >
      {/* Slot label */}
      <span className="flex h-7 w-9 flex-shrink-0 items-center justify-center rounded text-xs font-bold bg-muted/50 text-muted-foreground">
        {displaySlot}
      </span>

      {/* Position chip */}
      <span className={`flex h-6 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${posClass}`}>
        {player.position ?? '—'}
      </span>

      {/* Name + team */}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground leading-tight">
          {player.full_name}
        </span>
        <span className="text-xs text-muted-foreground leading-tight">
          {player.team ?? 'FA'}{player.bye_week ? ` · Bye ${player.bye_week}` : ''}
        </span>
      </div>

      {/* Injury badge */}
      {injuryCfg && (
        <span
          className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${injuryCfg.color}`}
          title={player.injury_status ?? ''}
        >
          {injuryCfg.label}
        </span>
      )}
    </button>
  );
}

export { positionChipClass };
