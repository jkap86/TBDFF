'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ChatMessage, Conversation } from '@tbdff/shared';
import { useSocket } from './SocketProvider';

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
  unreadLeague: number;
  unreadDM: number;
}

const ChatPanelContext = createContext<ChatPanelContextValue | null>(null);

export function ChatPanelProvider({ children }: { children: React.ReactNode }) {
  const { socket } = useSocket();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('dms');
  const [leagueId, setLeagueIdRaw] = useState<string | null>(null);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [unreadLeague, setUnreadLeague] = useState(0);
  const [unreadDM, setUnreadDM] = useState(0);

  // Use refs to avoid stale closures in the socket handler
  const isOpenRef = useRef(isOpen);
  const activeTabRef = useRef(activeTab);
  const leagueIdRef = useRef(leagueId);
  const activeConversationRef = useRef(activeConversation);

  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { leagueIdRef.current = leagueId; }, [leagueId]);
  useEffect(() => { activeConversationRef.current = activeConversation; }, [activeConversation]);

  // Listen globally for incoming messages to track unread counts
  useEffect(() => {
    if (!socket) return;
    const handler = (msg: ChatMessage) => {
      const panelOpen = isOpenRef.current;
      const tab = activeTabRef.current;

      if (msg.league_id) {
        // League message — increment if panel closed or not on league tab
        if (!panelOpen || tab !== 'league') {
          setUnreadLeague((c) => c + 1);
        }
      } else if (msg.conversation_id) {
        // DM message — increment if panel closed, not on DMs tab, or viewing a different conversation
        if (
          !panelOpen ||
          tab !== 'dms' ||
          activeConversationRef.current?.id !== msg.conversation_id
        ) {
          setUnreadDM((c) => c + 1);
        }
      }
    };
    socket.on('chat:message', handler);
    return () => {
      socket.off('chat:message', handler);
    };
  }, [socket]);

  const setLeagueId = useCallback((id: string | null) => {
    setLeagueIdRaw(id);
  }, []);

  // When leagueId is cleared, auto-switch to DMs tab
  useEffect(() => {
    if (!leagueId) {
      setActiveTab('dms');
    }
  }, [leagueId]);

  // Reset league unread when league tab becomes visible
  const handleSetActiveTab = useCallback((tab: ActiveTab) => {
    setActiveTab(tab);
    if (tab === 'league') setUnreadLeague(0);
    if (tab === 'dms' && !activeConversationRef.current) setUnreadDM(0);
  }, []);

  const openConversation = useCallback((conversation: Conversation) => {
    setActiveConversation(conversation);
    setActiveTab('dms');
    setIsOpen(true);
  }, []);

  const openPanel = useCallback(() => {
    if (!isOpen && leagueId) {
      setActiveTab('league');
      setUnreadLeague(0);
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
        setActiveTab: handleSetActiveTab,
        leagueId,
        setLeagueId,
        activeConversation,
        openConversation,
        openPanel,
        closePanel,
        setActiveConversation,
        unreadLeague,
        unreadDM,
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
