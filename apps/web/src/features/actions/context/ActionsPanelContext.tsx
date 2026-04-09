'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type ActionsTab = 'lineup' | 'trades' | 'waivers';

interface ActionsPanelContextValue {
  isOpen: boolean;
  activeTab: ActionsTab;
  setActiveTab: (tab: ActionsTab) => void;
  leagueId: string | null;
  setLeagueId: (id: string | null) => void;
  openPanel: (tab?: ActionsTab) => void;
  closePanel: () => void;
}

const ActionsPanelContext = createContext<ActionsPanelContextValue | null>(null);

const LAST_TAB_STORAGE_KEY = 'actions_panel_last_tab';

function loadLastTab(): ActionsTab {
  if (typeof window === 'undefined') return 'lineup';
  try {
    const raw = localStorage.getItem(LAST_TAB_STORAGE_KEY);
    if (raw === 'lineup' || raw === 'trades' || raw === 'waivers') return raw;
  } catch {
    /* ignore */
  }
  return 'lineup';
}

export function ActionsPanelProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTabState] = useState<ActionsTab>('lineup');
  const [leagueId, setLeagueIdRaw] = useState<string | null>(null);

  // Hydrate last-used tab from localStorage on mount
  useEffect(() => {
    setActiveTabState(loadLastTab());
  }, []);

  const persistTab = useCallback((tab: ActionsTab) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(LAST_TAB_STORAGE_KEY, tab);
    } catch {
      /* ignore */
    }
  }, []);

  const setActiveTab = useCallback(
    (tab: ActionsTab) => {
      setActiveTabState(tab);
      persistTab(tab);
    },
    [persistTab],
  );

  const setLeagueId = useCallback((id: string | null) => {
    setLeagueIdRaw(id);
  }, []);

  // Auto-close panel when navigating away from any league
  useEffect(() => {
    if (!leagueId) {
      setIsOpen(false);
    }
  }, [leagueId]);

  const openPanel = useCallback(
    (tab?: ActionsTab) => {
      if (!leagueId) return;
      if (tab) {
        setActiveTabState(tab);
        persistTab(tab);
      }
      setIsOpen(true);
    },
    [leagueId, persistTab],
  );

  const closePanel = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <ActionsPanelContext.Provider
      value={{
        isOpen,
        activeTab,
        setActiveTab,
        leagueId,
        setLeagueId,
        openPanel,
        closePanel,
      }}
    >
      {children}
    </ActionsPanelContext.Provider>
  );
}

export function useActionsPanel(): ActionsPanelContextValue {
  const ctx = useContext(ActionsPanelContext);
  if (!ctx) throw new Error('useActionsPanel must be used within ActionsPanelProvider');
  return ctx;
}
