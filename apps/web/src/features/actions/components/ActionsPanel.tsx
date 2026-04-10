'use client';

import { useEffect } from 'react';
import { Maximize2, Minimize2, X, Zap, ArrowLeftRight, ClipboardList, Settings } from 'lucide-react';
import { useDraggablePanel } from '@/hooks/useDraggablePanel';
import { usePanelFocus } from '@/hooks/usePanelFocus';
import { useActionsPanel } from '../context/ActionsPanelContext';
import { LineupView } from './LineupView';
import { TradesView } from './TradesView';
import { WaiversView } from './WaiversView';

const TAB_LABELS = {
  lineup: 'Lineup',
  trades: 'Trades',
  waivers: 'Waivers',
} as const;

export function ActionsPanel() {
  const { isOpen, activeTab, setActiveTab, leagueId, openPanel, closePanel } = useActionsPanel();
  const {
    panelRect,
    isDragging,
    isMaximized,
    toggleMaximize,
    handleDragPointerDown,
    handleResizePointerDown,
  } = useDraggablePanel(isOpen, {
    storageKey: 'actions_panel_rect',
    defaultWidth: 520,
    defaultHeight: 600,
    defaultAnchor: 'bottom-left',
  });
  const { isFocused, focus } = usePanelFocus('actions');

  useEffect(() => {
    if (isOpen) focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleToggle = () => {
    if (isOpen) {
      closePanel();
    } else {
      openPanel();
    }
  };

  const triggerDisabled = !leagueId;

  return (
    <>
      {/* Floating trigger button — sits to the left of chat trigger */}
      <button
        onClick={handleToggle}
        disabled={triggerDisabled}
        aria-label="Open actions"
        className="fixed bottom-6 right-24 z-[60] flex h-12 w-12 items-center justify-center rounded-full bg-neon-purple text-white shadow-lg hover:bg-neon-purple/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Settings className="h-5 w-5" />
      </button>

      {isOpen && leagueId && (
        <div
          className="fixed flex flex-col overflow-hidden rounded-2xl border border-border bg-chat-bg/50 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.4),0_2px_8px_rgba(0,0,0,0.3)]"
          style={{
            left: panelRect.x,
            top: panelRect.y,
            width: panelRect.width,
            height: panelRect.height,
            zIndex: isFocused ? 51 : 50,
          }}
          onPointerDown={focus}
          onWheel={(e) => e.stopPropagation()}
        >
          {/* Header — drag handle */}
          <div
            className="flex shrink-0 items-center justify-between border-b border-border bg-background/40 px-4 py-3 shadow-[0_2px_4px_rgba(0,0,0,0.15)]"
            style={{
              cursor: isDragging ? 'grabbing' : 'grab',
              touchAction: 'none',
              userSelect: 'none',
            }}
            onPointerDown={handleDragPointerDown}
          >
            <span className="text-sm font-semibold text-foreground">{TAB_LABELS[activeTab]}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={toggleMaximize}
                onPointerDown={(e) => e.stopPropagation()}
                className="rounded p-0.5 text-muted-foreground hover:text-accent-foreground"
                aria-label={isMaximized ? 'Restore panel size' : 'Maximize panel'}
              >
                {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <button
                onClick={closePanel}
                onPointerDown={(e) => e.stopPropagation()}
                className="rounded p-0.5 text-muted-foreground hover:text-accent-foreground"
                aria-label="Close actions"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex shrink-0 border-b border-border bg-background/40 shadow-[0_2px_4px_rgba(0,0,0,0.15)]">
            <button
              onClick={() => setActiveTab('lineup')}
              className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors ${
                activeTab === 'lineup'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-accent-foreground'
              }`}
            >
              <Zap className="h-3.5 w-3.5" />
              Lineup
            </button>
            <button
              onClick={() => setActiveTab('trades')}
              className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors ${
                activeTab === 'trades'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-accent-foreground'
              }`}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Trades
            </button>
            <button
              onClick={() => setActiveTab('waivers')}
              className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors ${
                activeTab === 'waivers'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-accent-foreground'
              }`}
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Waivers
            </button>
          </div>

          {/* Body — all tabs stay mounted, toggle visibility to keep queries warm */}
          <div className="flex flex-1 overflow-hidden shadow-[inset_0_2px_8px_rgba(0,0,0,0.2)]">
            <div
              className={`min-h-0 w-full ${
                activeTab === 'lineup' ? 'flex flex-1 flex-col overflow-hidden' : 'hidden'
              }`}
            >
              <LineupView leagueId={leagueId} />
            </div>
            <div
              className={`min-h-0 w-full ${
                activeTab === 'trades' ? 'flex flex-1 flex-col overflow-hidden' : 'hidden'
              }`}
            >
              <TradesView leagueId={leagueId} />
            </div>
            <div
              className={`min-h-0 w-full ${
                activeTab === 'waivers' ? 'flex flex-1 flex-col overflow-hidden' : 'hidden'
              }`}
            >
              <WaiversView leagueId={leagueId} />
            </div>
          </div>

          {/* Resize handle — bottom-right corner */}
          <div
            onPointerDown={handleResizePointerDown}
            className="absolute bottom-0 right-0 flex h-5 w-5 cursor-nwse-resize items-end justify-end p-0.5"
            style={{ touchAction: 'none' }}
          >
            <svg className="h-3 w-3 text-disabled" viewBox="0 0 6 6" fill="currentColor">
              <circle cx="5" cy="1" r="0.75" />
              <circle cx="3" cy="3" r="0.75" />
              <circle cx="5" cy="3" r="0.75" />
              <circle cx="1" cy="5" r="0.75" />
              <circle cx="3" cy="5" r="0.75" />
              <circle cx="5" cy="5" r="0.75" />
            </svg>
          </div>
        </div>
      )}
    </>
  );
}
