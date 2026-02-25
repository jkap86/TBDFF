'use client';

import { ChevronLeft, MessageSquare, X } from 'lucide-react';
import { useConversations } from '../hooks/useConversations';
import { useDMPanel } from '../context/DMPanelContext';
import { ConversationList } from './ConversationList';
import { DMConversation } from './DMConversation';

export function DMPanel() {
  const { isOpen, activeConversation, openPanel, closePanel, setActiveConversation } = useDMPanel();
  const { conversations, isLoading } = useConversations();

  const handleSelect = (conversationId: string) => {
    const conv = conversations.find((c) => c.id === conversationId);
    if (conv) setActiveConversation(conv);
  };

  const handleBack = () => setActiveConversation(null);

  const handleToggle = () => {
    if (isOpen) {
      closePanel();
    } else {
      openPanel();
    }
  };

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={handleToggle}
        aria-label="Open messages"
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        <MessageSquare className="h-5 w-5" />
      </button>

      {/* Panel */}
      {isOpen && (
        <div
          className="fixed bottom-22 right-6 z-50 flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800"
          style={{ width: '320px', height: '480px', bottom: '80px' }}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            {activeConversation ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBack}
                  className="rounded p-0.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                  aria-label="Back to conversations"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {activeConversation.other_username}
                </span>
              </div>
            ) : (
              <span className="text-sm font-semibold text-gray-900 dark:text-white">Messages</span>
            )}
            <button
              onClick={closePanel}
              className="rounded p-0.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              aria-label="Close messages"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex flex-1 overflow-hidden">
            {activeConversation ? (
              <DMConversation conversationId={activeConversation.id} />
            ) : (
              <ConversationList
                conversations={conversations}
                isLoading={isLoading}
                onSelect={handleSelect}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
