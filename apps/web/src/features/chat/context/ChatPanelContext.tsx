'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Conversation } from '@tbdff/shared';

type ActiveTab = 'league' | 'dms';

interface ChatPanelContextValue {
  isOpen: boolean;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  leagueId: string | null;
  setLeagueId: (id: string | null) => void;
  activeConversation: Conversation | null;
  openConversation: (conversation: Conversation) => void;
  openPanel: () => void;
  closePanel: () => void;
  setActiveConversation: (conversation: Conversation | null) => void;
}

const ChatPanelContext = createContext<ChatPanelContextValue | null>(null);

export function ChatPanelProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('dms');
  const [leagueId, setLeagueIdRaw] = useState<string | null>(null);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);

  const setLeagueId = useCallback((id: string | null) => {
    setLeagueIdRaw(id);
  }, []);

  // When leagueId is cleared, auto-switch to DMs tab
  useEffect(() => {
    if (!leagueId) {
      setActiveTab('dms');
    }
  }, [leagueId]);

  const openConversation = useCallback((conversation: Conversation) => {
    setActiveConversation(conversation);
    setActiveTab('dms');
    setIsOpen(true);
  }, []);

  const openPanel = useCallback(() => {
    if (!isOpen && leagueId) {
      setActiveTab('league');
    }
    setIsOpen(true);
  }, [leagueId, isOpen]);

  const closePanel = useCallback(() => {
    setIsOpen(false);
    setActiveConversation(null);
  }, []);

  return (
    <ChatPanelContext.Provider
      value={{
        isOpen,
        activeTab,
        setActiveTab,
        leagueId,
        setLeagueId,
        activeConversation,
        openConversation,
        openPanel,
        closePanel,
        setActiveConversation,
      }}
    >
      {children}
    </ChatPanelContext.Provider>
  );
}

export function useChatPanel(): ChatPanelContextValue {
  const ctx = useContext(ChatPanelContext);
  if (!ctx) throw new Error('useChatPanel must be used within ChatPanelProvider');
  return ctx;
}
