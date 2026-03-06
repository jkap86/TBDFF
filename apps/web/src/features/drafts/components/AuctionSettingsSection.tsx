'use client';

const NOMINATION_TIMER_PRESETS = [
  { label: '15s', value: 15 },
  { label: '30s', value: 30 },
  { label: '45s', value: 45 },
  { label: '1m', value: 60 },
];

const OFFERING_TIMER_PRESETS = [
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '2m', value: 120 },
  { label: '5m', value: 300 },
];

interface AuctionSettingsSectionProps {
  isAuction: boolean;
  isSlowAuction: boolean;
  maxPlayersPerTeam: number;
  onMaxPlayersPerTeamChange: (v: number) => void;
  nominationTimer: number;
  onNominationTimerChange: (v: number) => void;
  offeringTimer: number;
  onOfferingTimerChange: (v: number) => void;
  budget: number;
  onBudgetChange: (v: number) => void;
  customNomTimer: string;
  onCustomNomTimerChange: (v: string) => void;
  customOfferingTimer: string;
  onCustomOfferingTimerChange: (v: string) => void;
}

export function AuctionSettingsSection({
  isAuction,
  isSlowAuction,
  maxPlayersPerTeam,
  onMaxPlayersPerTeamChange,
  nominationTimer,
  onNominationTimerChange,
  offeringTimer,
  onOfferingTimerChange,
  budget,
  onBudgetChange,
  customNomTimer,
  onCustomNomTimerChange,
  customOfferingTimer,
  onCustomOfferingTimerChange,
}: AuctionSettingsSectionProps) {
  const isAnyAuction = isAuction || isSlowAuction;
  const isPresetNomTimer = NOMINATION_TIMER_PRESETS.some((p) => p.value === nominationTimer);
  const isPresetOfferingTimer = OFFERING_TIMER_PRESETS.some((p) => p.value === offeringTimer);

  return (
    <>
      {/* Max Players Per Team (any auction) */}
      {isAnyAuction && (
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Max Players / Team</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={maxPlayersPerTeam}
              onChange={(e) => onMaxPlayersPerTeamChange(Math.max(0, Math.min(50, parseInt(e.target.value) || 0)))}
              min={0}
              max={50}
              className="w-20 rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <span className="text-xs text-disabled">0 = same as rounds</span>
          </div>
        </div>
      )}

      {/* Offering Timer (auction only) */}
      {isAuction && (
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Offering Timer</label>
          <div className="flex flex-wrap gap-1.5">
            {OFFERING_TIMER_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => { onOfferingTimerChange(preset.value); onCustomOfferingTimerChange(''); }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  offeringTimer === preset.value
                    ? 'bg-primary text-primary-foreground ring-2 ring-ring'
                    : 'bg-muted text-accent-foreground hover:bg-muted-hover'
                }`}
              >
                {preset.label}
              </button>
            ))}
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={!isPresetOfferingTimer ? offeringTimer : customOfferingTimer}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 0;
                  onCustomOfferingTimerChange(e.target.value);
                  onOfferingTimerChange(Math.max(0, Math.min(86400, val)));
                }}
                placeholder="Custom"
                min={0}
                max={86400}
                className="w-20 rounded-lg border border-input px-2 py-1.5 text-xs text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <span className="text-xs text-disabled">sec</span>
            </div>
          </div>
        </div>
      )}

      {/* Bid Timer (auction only) */}
      {isAuction && (
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Bid Timer</label>
          <div className="flex flex-wrap gap-1.5">
            {NOMINATION_TIMER_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => { onNominationTimerChange(preset.value); onCustomNomTimerChange(''); }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  nominationTimer === preset.value
                    ? 'bg-primary text-primary-foreground ring-2 ring-ring'
                    : 'bg-muted text-accent-foreground hover:bg-muted-hover'
                }`}
              >
                {preset.label}
              </button>
            ))}
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={!isPresetNomTimer ? nominationTimer : customNomTimer}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 0;
                  onCustomNomTimerChange(e.target.value);
                  onNominationTimerChange(Math.max(0, Math.min(86400, val)));
                }}
                placeholder="Custom"
                min={0}
                max={86400}
                className="w-20 rounded-lg border border-input px-2 py-1.5 text-xs text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <span className="text-xs text-disabled">sec</span>
            </div>
          </div>
        </div>
      )}

      {/* Budget (any auction) */}
      {isAnyAuction && (
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Auction Budget</label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">$</span>
            <input
              type="number"
              value={budget}
              onChange={(e) => onBudgetChange(Math.max(1, Math.min(9999, parseInt(e.target.value) || 1)))}
              min={1}
              max={9999}
              className="w-24 rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      )}
    </>
  );
}
