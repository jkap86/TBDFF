'use client';

interface DerbySettingsSectionProps {
  derbyTimer: number;
  onDerbyTimerChange: (v: number) => void;
  derbyTimeoutAction: number;
  onDerbyTimeoutActionChange: (v: number) => void;
}

export function DerbySettingsSection({
  derbyTimer,
  onDerbyTimerChange,
  derbyTimeoutAction,
  onDerbyTimeoutActionChange,
}: DerbySettingsSectionProps) {
  return (
    <>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Derby Pick Timer</label>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={derbyTimer > 0}
              onChange={(e) => onDerbyTimerChange(e.target.checked ? 60 : 0)}
              className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
            />
            <span className="text-xs text-accent-foreground">{derbyTimer > 0 ? 'Enabled' : 'Off'}</span>
          </label>
          {derbyTimer > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={Math.floor(derbyTimer / 3600)}
                  onChange={(e) => {
                    const hrs = Math.max(0, Math.min(24, parseInt(e.target.value) || 0));
                    const remainingSecs = derbyTimer % 3600;
                    onDerbyTimerChange(hrs * 3600 + remainingSecs);
                  }}
                  min={0}
                  max={24}
                  className="w-14 rounded-lg border border-input px-2 py-2 text-sm text-center text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <span className="text-sm text-muted-foreground">h</span>
              </div>
              <span className="text-lg font-medium text-muted-foreground">:</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={Math.floor((derbyTimer % 3600) / 60)}
                  onChange={(e) => {
                    const mins = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                    const hrs = Math.floor(derbyTimer / 3600);
                    const secs = derbyTimer % 60;
                    onDerbyTimerChange(hrs * 3600 + mins * 60 + secs);
                  }}
                  min={0}
                  max={59}
                  className="w-14 rounded-lg border border-input px-2 py-2 text-sm text-center text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <span className="text-sm text-muted-foreground">m</span>
              </div>
              <span className="text-lg font-medium text-muted-foreground">:</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={derbyTimer % 60}
                  onChange={(e) => {
                    const secs = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                    const hrs = Math.floor(derbyTimer / 3600);
                    const mins = Math.floor((derbyTimer % 3600) / 60);
                    onDerbyTimerChange(hrs * 3600 + mins * 60 + secs);
                  }}
                  min={0}
                  max={59}
                  className="w-14 rounded-lg border border-input px-2 py-2 text-sm text-center text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <span className="text-sm text-muted-foreground">s</span>
              </div>
            </div>
          )}
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Timer Expiry Action</label>
        <div className="flex gap-1.5">
          {([
            { value: 0, label: 'Autopick' },
            { value: 1, label: 'Skip' },
          ] as const).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onDerbyTimeoutActionChange(opt.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                derbyTimeoutAction === opt.value
                  ? 'bg-primary text-primary-foreground ring-2 ring-ring'
                  : 'bg-muted text-accent-foreground hover:bg-muted-hover'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-disabled mt-1">
          {derbyTimeoutAction === 0
            ? 'Random slot assigned when timer expires'
            : 'User is skipped and can pick later at any time'}
        </p>
      </div>
    </>
  );
}
