'use client';

import { useState, useEffect } from 'react';

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
  const [timerH, setTimerH] = useState(() => String(Math.floor(derbyTimer / 3600)));
  const [timerM, setTimerM] = useState(() => String(Math.floor((derbyTimer % 3600) / 60)));
  const [timerS, setTimerS] = useState(() => String(derbyTimer % 60));

  /*

  // Sync string states when derbyTimer changes externally (checkbox toggle, draft reset)
  useEffect(() => {
    setTimerH(String(Math.floor(derbyTimer / 3600)));
    setTimerM(String(Math.floor((derbyTimer % 3600) / 60)));
    setTimerS(String(derbyTimer % 60));
  }, [derbyTimer]);

  */

  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-muted-foreground">Derby Pick Timer</label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={derbyTimer > 0}
              onChange={(e) => onDerbyTimerChange(e.target.checked ? 60 : 0)}
              className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
            />
            <span className="text-xs text-accent-foreground">
              {derbyTimer > 0 ? 'Enabled' : 'Off'}
            </span>
          </label>
        </div>

        <div
          className={
            'flex items-center justify-center gap-1.5 ' + (derbyTimer === 0 ? 'opacity-50' : '')
          }
        >
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={timerH}
              onChange={(e) => {
                setTimerH(e.target.value);
                if (e.target.value === '') return;
                const hrs = Math.max(0, Math.min(24, parseInt(e.target.value) || 0));
                onDerbyTimerChange(hrs * 3600 + (derbyTimer % 3600));
              }}
              onBlur={() => {
                if (timerH === '') setTimerH(String(Math.floor(derbyTimer / 3600)));
              }}
              min={0}
              max={24}
              className="w-14 rounded-lg border border-input px-2 py-2 text-sm text-center text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <span className="text-xs text-muted-foreground">h</span>
          </div>
          <span className="text-base font-medium text-muted-foreground">:</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={timerM}
              onChange={(e) => {
                setTimerM(e.target.value);
                if (e.target.value === '') return;
                const mins = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                const hrs = Math.floor(derbyTimer / 3600);
                const secs = derbyTimer % 60;
                onDerbyTimerChange(hrs * 3600 + mins * 60 + secs);
              }}
              onBlur={() => {
                if (timerM === '') setTimerM(String(Math.floor((derbyTimer % 3600) / 60)));
              }}
              min={0}
              max={59}
              className="w-14 rounded-lg border border-input px-2 py-2 text-sm text-center text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <span className="text-xs text-muted-foreground">m</span>
          </div>
          <span className="text-base font-medium text-muted-foreground">:</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={timerS}
              onChange={(e) => {
                setTimerS(e.target.value);
                if (e.target.value === '') return;
                const secs = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                const hrs = Math.floor(derbyTimer / 3600);
                const mins = Math.floor((derbyTimer % 3600) / 60);
                onDerbyTimerChange(hrs * 3600 + mins * 60 + secs);
              }}
              onBlur={() => {
                if (timerS === '') setTimerS(String(derbyTimer % 60));
              }}
              min={0}
              max={59}
              className="w-14 rounded-lg border border-input px-2 py-2 text-sm text-center text-foreground bg-card focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <span className="text-xs text-muted-foreground">s</span>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between my-5">
            <label className="text-xs font-medium text-muted-foreground">Timer Expiry</label>
            <div className="flex gap-1.5">
              {(
                [
                  { value: 0, label: 'Autopick' },
                  { value: 1, label: 'Skip' },
                ] as const
              ).map((opt) => (
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
          </div>
          <p className="text-xs text-disabled">
            {derbyTimeoutAction === 0
              ? 'Random slot assigned when timer expires'
              : 'User is skipped and can pick later at any time'}
          </p>
        </div>
      </div>
    </>
  );
}
