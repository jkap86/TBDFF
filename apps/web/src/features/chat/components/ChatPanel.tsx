'use client';

import { ChevronLeft, Maximize2, MessageSquare, Minimize2, X } from 'lucide-react';
import { useConversations } from '../hooks/useConversations';
import { useDraggablePanel } from '@/hooks/useDraggablePanel';
import { useChatPanel } from '../context/ChatPanelContext';
import { ConversationList } from './ConversationList';
import { DMConversation } from './DMConversation';
import { LeagueChat } from './LeagueChat';

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  const display = count > 99 ? '99+' : String(count);
  return (
    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-neon-rose px-1 text-[10px] font-bold leading-none text-white">
      {display}
    </span>
  );
}

function TabDot({ show }: { show: boolean }) {
  if (!show) return null;
  return <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-neon-rose" />;
}

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
    unreadLeague,
    unreadDM,
  } = useChatPanel();
  const { conversations, isLoading, startConversation } = useConversations();
  const { panelRect, isDragging, isMaximized, toggleMaximize, handleDragPointerDown, handleResizePointerDown } =
    useDraggablePanel(isOpen, {
      storageKey: 'chat_panel_rect',
      defaultWidth: 350,
      defaultHeight: 400,
      defaultAnchor: 'bottom-right',
    });

  const totalUnread = unreadLeague + unreadDM;

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
        <span className="relative">
          <MessageSquare className="h-5 w-5" />
          <Badge count={totalUnread} />
        </span>
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
                aria-label="Close messages"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          {showTabs && (
            <div className="flex shrink-0 border-b border-border bg-background/40 shadow-[0_2px_4px_rgba(0,0,0,0.15)]">
              <button
                onClick={() => setActiveTab('league')}
                className={`flex flex-1 items-center justify-center py-2 text-sm font-medium transition-colors ${
                  activeTab === 'league'
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground hover:text-accent-foreground'
                }`}
              >
                League Chat
                {activeTab !== 'league' && <TabDot show={unreadLeague > 0} />}
              </button>
              <button
                onClick={() => setActiveTab('dms')}
                className={`flex flex-1 items-center justify-center py-2 text-sm font-medium transition-colors ${
                  activeTab === 'dms'
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground hover:text-accent-foreground'
                }`}
              >
                DMs
                {activeTab !== 'dms' && <TabDot show={unreadDM > 0} />}
              </button>
            </div>
          )}

          {/* Body — both tabs stay mounted, toggle visibility */}
          <div className="flex flex-1 overflow-hidden shadow-[inset_0_2px_8px_rgba(0,0,0,0.2)]">
            {/* League Chat tab */}
            {leagueId && (
              <div className={`min-h-0 w-full ${activeTab === 'league' ? 'flex flex-1 flex-col overflow-hidden' : 'hidden'}`}>
                <LeagueChat leagueId={leagueId} />
              </div>
            )}

            {/* DMs tab */}
            <div className={`min-h-0 w-full ${activeTab === 'dms' ? 'flex flex-1 flex-col overflow-hidden' : 'hidden'}`}>
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
