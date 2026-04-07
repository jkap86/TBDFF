import type { Roster, Player } from '@tbdff/shared';
import { positionChipClass } from '@/features/roster/components/PlayerCard';

interface BoxScoreProps {
  rosterA: Roster;
  rosterB: Roster;
  rosterAName: string;
  rosterBName: string;
  playerMap: Record<string, Player>;
  scoreMap: Record<string, number>;
  projectedMap?: Record<string, number>;
  isLive?: boolean;
  starterSlots: string[];
}

function PlayerScoreRow({
  playerId,
  slotLabel,
  player,
  score,
  projected,
  isLive,
}: {
  playerId: string;
  slotLabel: string;
  player: Player | undefined;
  score: number;
  projected?: number;
  isLive?: boolean;
}) {
  const pos = player?.position ?? null;
  const chipClass = positionChipClass(pos);
  const hasScore = score > 0;

  return (
    <div className="flex items-center gap-2 py-1.5 text-sm">
      <span className="w-8 flex-shrink-0 text-center text-xs font-bold text-muted-foreground">
        {slotLabel}
      </span>
      <span className={`flex h-5 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${chipClass}`}>
        {pos ?? '—'}
      </span>
      <span className="min-w-0 flex-1 truncate text-foreground">
        {player?.full_name ?? (playerId ? 'Unknown' : 'Empty')}
        {player?.team ? (
          <span className="ml-1 text-muted-foreground text-xs">{player.team}</span>
        ) : null}
      </span>
      <span className={`flex-shrink-0 tabular-nums font-medium ${hasScore ? 'text-foreground' : 'text-disabled'}`}>
        {hasScore ? score.toFixed(2) : '—'}
      </span>
      {isLive && projected !== undefined && projected > 0 && (
        <span className="flex-shrink-0 text-xs text-muted-foreground tabular-nums">
          ({projected.toFixed(1)})
        </span>
      )}
    </div>
  );
}

const STARTER_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'FLEX', 'SUPER_FLEX', 'REC_FLEX', 'WRRB_FLEX']);

function TeamBoxScore({
  roster,
  playerMap,
  scoreMap,
  projectedMap,
  isLive,
  starterSlots,
}: {
  roster: Roster;
  playerMap: Record<string, Player>;
  scoreMap: Record<string, number>;
  projectedMap?: Record<string, number>;
  isLive?: boolean;
  starterSlots: string[];
}) {
  const starterTotal = roster.starters.reduce((sum, pid) => sum + (scoreMap[pid] ?? 0), 0);

  const nonStarterSet = new Set([...roster.starters, ...roster.reserve, ...roster.taxi]);
  const bench = roster.players.filter((pid) => !nonStarterSet.has(pid));

  return (
    <div className="min-w-0">
      {/* Starters */}
      <div className="divide-y divide-border/40">
        {starterSlots.map((slot, idx) => {
          const pid = roster.starters[idx] ?? '';
          return (
            <PlayerScoreRow
              key={`${slot}-${idx}`}
              playerId={pid}
              slotLabel={slot === 'SUPER_FLEX' ? 'SF' : slot === 'WRRB_FLEX' ? 'W/R' : slot === 'REC_FLEX' ? 'REC' : slot}
              player={playerMap[pid]}
              score={scoreMap[pid] ?? 0}
              projected={projectedMap?.[pid]}
              isLive={isLive}
            />
          );
        })}
      </div>

      {/* Starters total */}
      <div className="mt-1 flex justify-end border-t border-border pt-1">
        <span className="text-sm font-bold text-foreground tabular-nums">
          {starterTotal.toFixed(2)}
        </span>
      </div>

      {/* Bench */}
      {bench.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-disabled">Bench</p>
          <div className="divide-y divide-border/30">
            {bench.map((pid) => (
              <PlayerScoreRow
                key={pid}
                playerId={pid}
                slotLabel="BN"
                player={playerMap[pid]}
                score={scoreMap[pid] ?? 0}
                projected={projectedMap?.[pid]}
                isLive={isLive}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function BoxScore({
  rosterA,
  rosterB,
  rosterAName,
  rosterBName,
  playerMap,
  scoreMap,
  projectedMap,
  isLive,
  starterSlots,
}: BoxScoreProps) {
  return (
    <div className="mt-4 border-t border-border pt-4">
      {isLive && (
        <div className="mb-3 flex justify-end gap-6 text-xs text-muted-foreground">
          <span>Pts</span>
          <span>(Proj)</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <p className="mb-2 truncate text-xs font-semibold uppercase tracking-wide text-neon-cyan">
            {rosterAName}
          </p>
          <TeamBoxScore
            roster={rosterA}
            playerMap={playerMap}
            scoreMap={scoreMap}
            projectedMap={projectedMap}
            isLive={isLive}
            starterSlots={starterSlots}
          />
        </div>
        <div>
          <p className="mb-2 truncate text-xs font-semibold uppercase tracking-wide text-neon-magenta">
            {rosterBName}
          </p>
          <TeamBoxScore
            roster={rosterB}
            playerMap={playerMap}
            scoreMap={scoreMap}
            projectedMap={projectedMap}
            isLive={isLive}
            starterSlots={starterSlots}
          />
        </div>
      </div>
    </div>
  );
}
