'use client';

import { ChevronLeft, MessageSquare, X } from 'lucide-react';
import { useConversations } from '../hooks/useConversations';
import { useChatPanel } from '../context/ChatPanelContext';
import { ConversationList } from './ConversationList';
import { DMConversation } from './DMConversation';
import { LeagueChat } from './LeagueChat';

export function ChatPanel() {
  const {
    isOpen,
    activeTab,
    setActiveTab,
    leagueId,
    activeConversation,
    openPanel,
    closePanel,
    setActiveConversation,
  } = useChatPanel();
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

  const showTabs = !!leagueId;

  const headerTitle = (() => {
    if (activeTab === 'dms' && activeConversation) {
      return null; // back button + username shown instead
    }
    if (activeTab === 'league') return 'League Chat';
    return 'Messages';
  })();

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
            {activeTab === 'dms' && activeConversation ? (
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
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                {headerTitle}
              </span>
            )}
            <button
              onClick={closePanel}
              className="rounded p-0.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              aria-label="Close messages"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Tabs */}
          {showTabs && (
            <div className="flex shrink-0 border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setActiveTab('league')}
                className={`flex-1 py-2 text-center text-sm font-medium transition-colors ${
                  activeTab === 'league'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                League Chat
              </button>
              <button
                onClick={() => setActiveTab('dms')}
                className={`flex-1 py-2 text-center text-sm font-medium transition-colors ${
                  activeTab === 'dms'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                DMs
              </button>
            </div>
          )}

          {/* Body — both tabs stay mounted, toggle visibility */}
          <div className="flex flex-1 overflow-hidden">
            {/* League Chat tab */}
            {leagueId && (
              <div className={`w-full ${activeTab === 'league' ? 'flex' : 'hidden'}`}>
                <LeagueChat leagueId={leagueId} />
              </div>
            )}

            {/* DMs tab */}
            <div className={`w-full ${activeTab === 'dms' ? 'flex' : 'hidden'}`}>
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
        </div>
      )}
    </>
  );
}
