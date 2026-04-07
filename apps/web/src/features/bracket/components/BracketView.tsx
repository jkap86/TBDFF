import type { BracketRound, BracketSlot } from '@/features/bracket/utils/buildBracket';

interface BracketViewProps {
  rounds: BracketRound[];
  getRosterLabel: (rosterId: number) => string;
}

function BracketSlotCard({
  slot,
  getRosterLabel,
}: {
  slot: BracketSlot;
  getRosterLabel: (id: number) => string;
}) {
  if (slot.isBye) {
    const name = slot.rosterIdA ? getRosterLabel(slot.rosterIdA) : '—';
    return (
      <div className="w-48 rounded-lg border border-neon-cyan/30 bg-card px-3 py-2.5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-neon-cyan">{name}</span>
          <span className="flex-shrink-0 text-xs text-muted-foreground italic">BYE</span>
        </div>
      </div>
    );
  }

  const nameA = slot.rosterIdA ? getRosterLabel(slot.rosterIdA) : '—';
  const nameB = slot.rosterIdB ? getRosterLabel(slot.rosterIdB) : 'TBD';
  const hasScore = slot.pointsA > 0 || slot.pointsB > 0;
  const aWins = hasScore && slot.winnerId === slot.rosterIdA;
  const bWins = hasScore && slot.winnerId === slot.rosterIdB;

  return (
    <div className="w-48 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      {/* Team A */}
      <div
        className={`flex items-center gap-2 px-3 py-2.5 ${
          aWins ? 'border-l-2 border-neon-cyan bg-neon-cyan/5' : ''
        }`}
      >
        <span className={`min-w-0 flex-1 truncate text-sm font-medium ${aWins ? 'text-foreground' : 'text-accent-foreground'}`}>
          {nameA}
        </span>
        <span className={`flex-shrink-0 tabular-nums text-sm font-bold ${aWins ? 'text-neon-cyan' : hasScore ? 'text-foreground' : 'text-disabled'}`}>
          {hasScore ? slot.pointsA.toFixed(2) : '—'}
        </span>
      </div>

      <div className="border-t border-border/60" />

      {/* Team B */}
      <div
        className={`flex items-center gap-2 px-3 py-2.5 ${
          bWins ? 'border-l-2 border-neon-cyan bg-neon-cyan/5' : ''
        }`}
      >
        <span className={`min-w-0 flex-1 truncate text-sm font-medium ${bWins ? 'text-foreground' : slot.rosterIdB ? 'text-accent-foreground' : 'text-disabled italic'}`}>
          {nameB}
        </span>
        <span className={`flex-shrink-0 tabular-nums text-sm font-bold ${bWins ? 'text-neon-cyan' : hasScore && slot.rosterIdB ? 'text-foreground' : 'text-disabled'}`}>
          {hasScore && slot.rosterIdB ? slot.pointsB.toFixed(2) : '—'}
        </span>
      </div>
    </div>
  );
}

export function BracketView({ rounds, getRosterLabel }: BracketViewProps) {
  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-10 min-w-max">
        {rounds.map((round) => (
          <div key={round.week} className="flex flex-col">
            {/* Round header */}
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {round.label}
              </p>
              <p className="text-xs text-disabled">Week {round.week}</p>
            </div>

            {/* Slots */}
            <div className="flex flex-col justify-around gap-6 flex-1">
              {round.slots.map((slot, i) => (
                <BracketSlotCard
                  key={slot.matchupId ?? `bye-${i}`}
                  slot={slot}
                  getRosterLabel={getRosterLabel}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
