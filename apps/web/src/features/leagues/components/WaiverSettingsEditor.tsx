'use client';

import { ChevronDown } from 'lucide-react';

interface WaiverSettingsEditorProps {
  waiverType: number;
  onWaiverTypeChange: (v: number) => void;
  waiverBudget: number;
  onWaiverBudgetChange: (v: number) => void;
  waiverBidMin: number;
  onWaiverBidMinChange: (v: number) => void;
  waiverDayOfWeek: number;
  onWaiverDayOfWeekChange: (v: number) => void;
  waiverClearDays: number;
  onWaiverClearDaysChange: (v: number) => void;
  dailyWaivers: boolean;
  onDailyWaiversChange: (v: boolean) => void;
  dailyWaiversHour: number;
  onDailyWaiversHourChange: (v: number) => void;
  showWaivers: boolean;
  onToggle: () => void;
  isSubmitting: boolean;
}

export function WaiverSettingsEditor({
  waiverType,
  onWaiverTypeChange,
  waiverBudget,
  onWaiverBudgetChange,
  waiverBidMin,
  onWaiverBidMinChange,
  waiverDayOfWeek,
  onWaiverDayOfWeekChange,
  waiverClearDays,
  onWaiverClearDaysChange,
  dailyWaivers,
  onDailyWaiversChange,
  dailyWaiversHour,
  onDailyWaiversHourChange,
  showWaivers,
  onToggle,
  isSubmitting,
}: WaiverSettingsEditorProps) {
  const inputClass = 'w-full rounded border border-input px-3 py-2 bg-muted text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring';
  const labelClass = 'mb-1 block text-sm font-medium text-accent-foreground';

  return (
    <div className="mb-4 rounded-lg border border-border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-accent-foreground hover:bg-accent rounded-lg"
      >
        <span>Waiver Settings</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${showWaivers ? 'rotate-180' : ''}`} />
      </button>
      {showWaivers && (
        <div className="border-t border-border px-4 py-3 space-y-4">
          <div>
            <label htmlFor="waiverType" className={labelClass}>Waiver Type</label>
            <select
              id="waiverType"
              value={waiverType}
              onChange={(e) => onWaiverTypeChange(parseInt(e.target.value, 10))}
              className={inputClass}
              disabled={isSubmitting}
            >
              <option value={2}>FAAB (Free Agent Auction Budget)</option>
              <option value={0}>Normal (Reverse Standings)</option>
              <option value={1}>Rolling Waivers</option>
            </select>
          </div>

          {waiverType === 2 && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="waiverBudget" className={labelClass}>FAAB Budget</label>
                <input
                  id="waiverBudget"
                  type="number"
                  value={waiverBudget}
                  onChange={(e) => onWaiverBudgetChange(Math.max(0, parseInt(e.target.value) || 0))}
                  min={0}
                  className={inputClass}
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label htmlFor="waiverBidMin" className={labelClass}>Min Bid</label>
                <input
                  id="waiverBidMin"
                  type="number"
                  value={waiverBidMin}
                  onChange={(e) => onWaiverBidMinChange(Math.max(0, parseInt(e.target.value) || 0))}
                  min={0}
                  className={inputClass}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="waiverDayOfWeek" className={labelClass}>Waiver Process Day</label>
              <select
                id="waiverDayOfWeek"
                value={waiverDayOfWeek}
                onChange={(e) => onWaiverDayOfWeekChange(parseInt(e.target.value, 10))}
                className={inputClass}
                disabled={isSubmitting}
              >
                <option value={0}>Sunday</option>
                <option value={1}>Monday</option>
                <option value={2}>Tuesday</option>
                <option value={3}>Wednesday</option>
                <option value={4}>Thursday</option>
                <option value={5}>Friday</option>
                <option value={6}>Saturday</option>
              </select>
            </div>
            <div>
              <label htmlFor="waiverClearDays" className={labelClass}>Clear Period (Days)</label>
              <input
                id="waiverClearDays"
                type="number"
                value={waiverClearDays}
                onChange={(e) => onWaiverClearDaysChange(Math.max(0, Math.min(7, parseInt(e.target.value) || 0)))}
                min={0}
                max={7}
                className={inputClass}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={dailyWaivers}
                onChange={(e) => onDailyWaiversChange(e.target.checked)}
                className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                disabled={isSubmitting}
              />
              <span className="text-sm font-medium text-accent-foreground">Daily Waivers</span>
            </label>
            <p className="mt-1 ml-7 text-xs text-muted-foreground">
              Process waivers every day instead of once per week
            </p>
          </div>

          {dailyWaivers && (
            <div>
              <label htmlFor="dailyWaiversHour" className={labelClass}>Daily Process Hour</label>
              <select
                id="dailyWaiversHour"
                value={dailyWaiversHour}
                onChange={(e) => onDailyWaiversHourChange(parseInt(e.target.value, 10))}
                className={inputClass}
                disabled={isSubmitting}
              >
                {[...Array(24)].map((_, h) => (
                  <option key={h} value={h}>
                    {h === 0 ? '12:00 AM' : h < 12 ? `${h}:00 AM` : h === 12 ? '12:00 PM' : `${h - 12}:00 PM`}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
