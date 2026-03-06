'use client';

const BID_WINDOW_PRESETS = [
  { label: '4h', value: 14400 },
  { label: '8h', value: 28800 },
  { label: '12h', value: 43200 },
  { label: '24h', value: 86400 },
  { label: '48h', value: 172800 },
];

const MAX_LOT_DURATION_PRESETS = [
  { label: 'No cap', value: 0 },
  { label: '3 days', value: 259200 },
  { label: '5 days', value: 432000 },
  { label: '7 days', value: 604800 },
  { label: '14 days', value: 1209600 },
];

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
}: SlowAuctionSettingsSectionProps) {
  const isPresetBidWindow = BID_WINDOW_PRESETS.some((p) => p.value === bidWindowSeconds);

  return (
    <>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Bid Window</label>
        <div className="flex flex-wrap gap-1.5">
          {BID_WINDOW_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => onBidWindowSecondsChange(preset.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                bidWindowSeconds === preset.value
                  ? 'bg-primary text-primary-foreground ring-2 ring-ring'
                  : 'bg-muted text-accent-foreground hover:bg-muted-hover'
              }`}
            >
              {preset.label}
            </button>
          ))}
          {!isPresetBidWindow && (
            <span className="text-xs text-muted-foreground self-center">{Math.round(bidWindowSeconds / 3600)}h</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Max Noms / Team</label>
          <input
            type="number"
            value={maxNominationsPerTeam}
            onChange={(e) => onMaxNominationsPerTeamChange(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
            min={1}
            max={50}
            className="w-20 rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
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
            className="w-20 rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Daily Nom Limit</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={dailyNominationLimit}
              onChange={(e) => onDailyNominationLimitChange(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
              min={0}
              max={100}
              className="w-20 rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <span className="text-xs text-disabled">0 = unlimited</span>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Min Bid</label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">$</span>
            <input
              type="number"
              value={minBid}
              onChange={(e) => onMinBidChange(Math.max(1, Math.min(999, parseInt(e.target.value) || 1)))}
              min={1}
              max={999}
              className="w-20 rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Min Increment</label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">$</span>
            <input
              type="number"
              value={minIncrement}
              onChange={(e) => onMinIncrementChange(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
              min={1}
              max={100}
              className="w-20 rounded-lg border border-input px-3 py-2 text-sm text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Max Lot Duration</label>
        <div className="flex flex-wrap gap-1.5">
          {MAX_LOT_DURATION_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => onMaxLotDurationSecondsChange(preset.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                maxLotDurationSeconds === preset.value
                  ? 'bg-primary text-primary-foreground ring-2 ring-ring'
                  : 'bg-muted text-accent-foreground hover:bg-muted-hover'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-disabled mt-1 block">
          0 = lots can extend indefinitely
        </span>
      </div>
    </>
  );
}
