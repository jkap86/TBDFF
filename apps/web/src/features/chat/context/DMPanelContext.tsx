'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import type { Conversation } from '@tbdff/shared';

interface DMPanelContextValue {
  isOpen: boolean;
  activeConversation: Conversation | null;
  openConversation: (conversation: Conversation) => void;
  openPanel: () => void;
  closePanel: () => void;
  setActiveConversation: (conversation: Conversation | null) => void;
}

const DMPanelContext = createContext<DMPanelContextValue | null>(null);

export function DMPanelProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);

  const openConversation = useCallback((conversation: Conversation) => {
    setActiveConversation(conversation);
    setIsOpen(true);
  }, []);

  const openPanel = useCallback(() => setIsOpen(true), []);

  const closePanel = useCallback(() => {
    setIsOpen(false);
    setActiveConversation(null);
  }, []);

  return (
    <DMPanelContext.Provider
      value={{ isOpen, activeConversation, openConversation, openPanel, closePanel, setActiveConversation }}
    >
      {children}
    </DMPanelContext.Provider>
  );
}

export function useDMPanel(): DMPanelContextValue {
  const ctx = useContext(DMPanelContext);
  if (!ctx) throw new Error('useDMPanel must be used within DMPanelProvider');
  return ctx;
}
