'use client';

import { ChevronLeft, MessageSquare, X } from 'lucide-react';
import { useConversations } from '../hooks/useConversations';
import { useDraggablePanel } from '../hooks/useDraggablePanel';
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
  const { conversations, isLoading, startConversation } = useConversations();
  const { panelRect, isDragging, handleDragPointerDown, handleResizePointerDown } =
    useDraggablePanel(isOpen);

  const handleSelect = (conversationId: string) => {
    const conv = conversations.find((c) => c.id === conversationId);
    if (conv) setActiveConversation(conv);
  };

  const handleStartConversation = async (userId: string) => {
    try {
      const conversation = await startConversation(userId);
      setActiveConversation(conversation);
    } catch {
      // silently ignore — user will see conversation list unchanged
    }
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
        className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <MessageSquare className="h-5 w-5" />
      </button>

      {/* Panel */}
      {isOpen && (
        <div
          className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-chat-bg/50 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.4),0_2px_8px_rgba(0,0,0,0.3)]"
          style={{
            left: panelRect.x,
            top: panelRect.y,
            width: panelRect.width,
            height: panelRect.height,
          }}
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
            {activeTab === 'dms' && activeConversation ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBack}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="rounded p-0.5 text-muted-foreground hover:text-accent-foreground"
                  aria-label="Back to conversations"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="text-sm font-semibold text-foreground">
                  {activeConversation.other_username}
                </span>
              </div>
            ) : (
              <span className="text-sm font-semibold text-foreground">
                {headerTitle}
              </span>
            )}
            <button
              onClick={closePanel}
              onPointerDown={(e) => e.stopPropagation()}
              className="rounded p-0.5 text-muted-foreground hover:text-accent-foreground"
              aria-label="Close messages"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Tabs */}
          {showTabs && (
            <div className="flex shrink-0 border-b border-border bg-background/40 shadow-[0_2px_4px_rgba(0,0,0,0.15)]">
              <button
                onClick={() => setActiveTab('league')}
                className={`flex-1 py-2 text-center text-sm font-medium transition-colors ${
                  activeTab === 'league'
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground hover:text-accent-foreground'
                }`}
              >
                League Chat
              </button>
              <button
                onClick={() => setActiveTab('dms')}
                className={`flex-1 py-2 text-center text-sm font-medium transition-colors ${
                  activeTab === 'dms'
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground hover:text-accent-foreground'
                }`}
              >
                DMs
              </button>
            </div>
          )}

          {/* Body — both tabs stay mounted, toggle visibility */}
          <div className="flex flex-1 overflow-hidden shadow-[inset_0_2px_8px_rgba(0,0,0,0.2)]">
            {/* League Chat tab */}
            {leagueId && (
              <div className={`w-full ${activeTab === 'league' ? 'flex flex-col' : 'hidden'}`}>
                <LeagueChat leagueId={leagueId} />
              </div>
            )}

            {/* DMs tab */}
            <div className={`w-full ${activeTab === 'dms' ? 'flex flex-col' : 'hidden'}`}>
              {activeConversation ? (
                <DMConversation conversationId={activeConversation.id} />
              ) : (
                <ConversationList
                  conversations={conversations}
                  isLoading={isLoading}
                  onSelect={handleSelect}
                  onStartConversation={handleStartConversation}
                />
              )}
            </div>
          </div>

          {/* Resize handle — bottom-right corner */}
          <div
            onPointerDown={handleResizePointerDown}
            className="absolute bottom-0 right-0 flex h-5 w-5 cursor-nwse-resize items-end justify-end p-0.5"
            style={{ touchAction: 'none' }}
          >
            <svg
              className="h-3 w-3 text-disabled"
              viewBox="0 0 6 6"
              fill="currentColor"
            >
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
