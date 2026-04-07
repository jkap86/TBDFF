'use client';

interface SlowAuctionSettingsSectionProps {
  bidWindowSeconds: number;
  onBidWindowSecondsChange: (v: number) => void;
  maxNominationsPerTeam: number;
  onMaxNominationsPerTeamChange: (v: number) => void;
  maxNominationsGlobal: number;
  onMaxNominationsGlobalChange: (v: number) => void;
  dailyNominationLimit: number;
  onDailyNominationLimitChange: (v: number) => void;
  minBid: number;
  onMinBidChange: (v: number) => void;
  minIncrement: number;
  onMinIncrementChange: (v: number) => void;
  maxLotDurationSeconds: number;
  onMaxLotDurationSecondsChange: (v: number) => void;
  timersOnly?: boolean;
}

export function SlowAuctionSettingsSection({
  bidWindowSeconds,
  onBidWindowSecondsChange,
  maxNominationsPerTeam,
  onMaxNominationsPerTeamChange,
  maxNominationsGlobal,
  onMaxNominationsGlobalChange,
  dailyNominationLimit,
  onDailyNominationLimitChange,
  minBid,
  onMinBidChange,
  minIncrement,
  onMinIncrementChange,
  maxLotDurationSeconds,
  onMaxLotDurationSecondsChange,
  timersOnly,
}: SlowAuctionSettingsSectionProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Bid Window</label>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            value={Math.round(bidWindowSeconds / 3600)}
            onChange={(e) => {
              const hours = Math.max(1, Math.min(168, parseInt(e.target.value) || 1));
              onBidWindowSecondsChange(hours * 3600);
            }}
            min={1}
            max={168}
            className="w-full rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">hrs</span>
        </div>
      </div>
      {!timersOnly && (
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Max Lot Duration</label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              value={Math.round(maxLotDurationSeconds / 86400)}
              onChange={(e) => {
                const days = Math.max(0, Math.min(30, parseInt(e.target.value) || 0));
                onMaxLotDurationSecondsChange(days * 86400);
              }}
              min={0}
              max={30}
              className="w-full rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <span className="text-xs text-muted-foreground">days</span>
          </div>
          <span className="text-xs text-disabled mt-0.5 block">0 = no cap</span>
        </div>
      )}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Max Noms / Team</label>
        <input
          type="number"
          value={maxNominationsPerTeam}
          onChange={(e) => onMaxNominationsPerTeamChange(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
          min={1}
          max={50}
          className="w-full rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Max Active Global</label>
        <input
          type="number"
          value={maxNominationsGlobal}
          onChange={(e) => onMaxNominationsGlobalChange(Math.max(1, Math.min(200, parseInt(e.target.value) || 1)))}
          min={1}
          max={200}
          className="w-full rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Daily Nom Limit</label>
        <input
          type="number"
          value={dailyNominationLimit}
          onChange={(e) => onDailyNominationLimitChange(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
          min={0}
          max={100}
          className="w-full rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <span className="text-xs text-disabled mt-0.5 block">0 = unlimited</span>
      </div>
      {!timersOnly && (
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Min Bid</label>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">$</span>
            <input
              type="number"
              value={minBid}
              onChange={(e) => onMinBidChange(Math.max(1, Math.min(999, parseInt(e.target.value) || 1)))}
              min={1}
              max={999}
              className="w-full rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      )}
      {!timersOnly && (
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Min Increment</label>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted-foreground">$</span>
            <input
              type="number"
              value={minIncrement}
              onChange={(e) => onMinIncrementChange(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
              min={1}
              max={100}
              className="w-full rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      )}
    </div>
  );
}
