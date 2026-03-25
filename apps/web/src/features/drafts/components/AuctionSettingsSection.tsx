'use client';

interface AuctionSettingsSectionProps {
  isAuction: boolean;
  isSlowAuction: boolean;
  rounds: number;
  maxPlayersPerTeam: number;
  onMaxPlayersPerTeamChange: (v: number) => void;
  nominationTimer: number;
  onNominationTimerChange: (v: number) => void;
  offeringTimer: number;
  onOfferingTimerChange: (v: number) => void;
  budget: number;
  onBudgetChange: (v: number) => void;
}

export function AuctionSettingsSection({
  isAuction,
  isSlowAuction,
  rounds,
  maxPlayersPerTeam,
  onMaxPlayersPerTeamChange,
  nominationTimer,
  onNominationTimerChange,
  offeringTimer,
  onOfferingTimerChange,
  budget,
  onBudgetChange,
}: AuctionSettingsSectionProps) {
  const isAnyAuction = isAuction || isSlowAuction;

  return (
    <>
      {/* Shared auction fields: Max Players + Budget */}
      {isAnyAuction && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Max Players / Team</label>
            <input
              type="number"
              value={maxPlayersPerTeam}
              onChange={(e) => onMaxPlayersPerTeamChange(Math.max(1, Math.min(50, parseInt(e.target.value) || rounds)))}
              min={1}
              max={50}
              className="w-full rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Budget</label>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">$</span>
              <input
                type="number"
                value={budget}
                onChange={(e) => onBudgetChange(Math.max(1, Math.min(9999, parseInt(e.target.value) || 1)))}
                min={1}
                max={9999}
                className="w-full rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        </div>
      )}

      {/* Auction-only timer fields: Offering + Bid on same row */}
      {isAuction && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Offering Timer</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={offeringTimer}
                onChange={(e) => onOfferingTimerChange(Math.max(0, Math.min(86400, parseInt(e.target.value) || 0)))}
                min={0}
                max={86400}
                className="w-full rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <span className="text-xs text-muted-foreground">sec</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Bid Timer</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                value={nominationTimer}
                onChange={(e) => onNominationTimerChange(Math.max(0, Math.min(86400, parseInt(e.target.value) || 0)))}
                min={0}
                max={86400}
                className="w-full rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <span className="text-xs text-muted-foreground">sec</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
