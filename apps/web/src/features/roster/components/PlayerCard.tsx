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

function positionTintClass(slot: string): string {
  switch (slot) {
    case 'QB': return 'bg-neon-cyan/15 text-neon-cyan';
    case 'RB': return 'bg-neon-orange/15 text-neon-orange';
    case 'WR': return 'bg-neon-magenta/15 text-neon-magenta';
    case 'TE': return 'bg-neon-purple/15 text-neon-purple';
    case 'FLEX':
    case 'SUPER_FLEX':
    case 'REC_FLEX':
    case 'WRRB_FLEX': return 'bg-neon-rose/15 text-neon-rose';
    default: return 'bg-muted/50 text-muted-foreground';
  }
}

const INJURY_CONFIG: Record<string, { label: string; color: string }> = {
  Out:          { label: 'OUT', color: 'bg-neon-rose text-white' },
  Doubtful:     { label: 'D',   color: 'bg-neon-rose/25 text-neon-rose' },
  Questionable: { label: 'Q',   color: 'bg-neon-orange/25 text-neon-orange' },
  Probable:     { label: 'P',   color: 'bg-neon-cyan/20 text-neon-cyan' },
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
  const slotTint = positionTintClass(slotLabel);

  const showSlotLabel = slotLabel !== '';

  if (!player) {
    const emptyContent = (
      <>
        {showSlotLabel && (
          <span className={`flex h-6 w-8 flex-shrink-0 items-center justify-center rounded text-[11px] font-bold ${slotTint}`}>
            {displaySlot}
          </span>
        )}
        <span
          className={`flex-1 rounded-md border border-dashed px-2.5 py-1.5 text-sm italic ${
            isSelected
              ? 'border-neon-cyan bg-neon-cyan/15 text-neon-cyan'
              : isSwappable
                ? 'border-neon-cyan/50 bg-neon-cyan/[0.06] text-neon-cyan/80'
                : 'border-neon-cyan/30 bg-neon-cyan/[0.03] text-disabled'
          }`}
        >
          Empty slot
        </span>
      </>
    );
    if (editMode && onClick) {
      return (
        <button
          type="button"
          onClick={onClick}
          className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-2 text-left transition-all ${
            isSelected
              ? 'ring-2 ring-neon-cyan shadow-[0_0_12px_rgba(0,240,255,0.35)]'
              : isSwappable
                ? 'hover:bg-neon-cyan/10 cursor-pointer'
                : 'hover:bg-muted/40 cursor-pointer'
          }`}
        >
          {emptyContent}
        </button>
      );
    }
    return <div className="flex items-center gap-2 py-2 px-1.5">{emptyContent}</div>;
  }

  const injuryCfg = player.injury_status ? INJURY_CONFIG[player.injury_status] : null;
  const posClass = positionChipClass(player.position);

  return (
    <button
      type="button"
      disabled={!editMode && !onClick}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-2 text-left transition-all ${
        editMode
          ? isSelected
            ? 'ring-2 ring-neon-cyan bg-neon-cyan/15 shadow-[0_0_12px_rgba(0,240,255,0.35)] scale-[1.01]'
            : isSwappable
              ? 'hover:bg-neon-cyan/10 hover:ring-1 hover:ring-neon-cyan/40 cursor-pointer ring-1 ring-border/60'
              : 'hover:bg-muted/40 cursor-pointer'
          : 'cursor-default'
      }`}
    >
      {/* Slot label (color-coded by position) */}
      {showSlotLabel && (
        <span className={`flex h-6 w-8 flex-shrink-0 items-center justify-center rounded text-[11px] font-bold ${slotTint}`}>
          {displaySlot}
        </span>
      )}

      {/* Position chip */}
      <span className={`flex h-6 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${posClass}`}>
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
          className={`flex h-5 min-w-[24px] flex-shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold uppercase tracking-wide ${injuryCfg.color}`}
          title={player.injury_status ?? ''}
        >
          {injuryCfg.label}
        </span>
      )}
    </button>
  );
}

export { positionChipClass, positionTintClass };
