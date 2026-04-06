'use client';

import type { LeagueMember, Roster } from '@tbdff/shared';

interface LeagueMembersStripProps {
  members: LeagueMember[];
  rosters: Roster[];
  currentUserId: string | undefined;
  onStartDM: (memberId: string) => void;
}

const ACCENT_COLORS = [
  'bg-neon-cyan/20 text-neon-cyan',
  'bg-neon-magenta/20 text-neon-magenta',
  'bg-neon-purple/20 text-neon-purple',
  'bg-neon-orange/20 text-neon-orange',
  'bg-neon-rose/20 text-neon-rose',
] as const;

export function LeagueMembersStrip({
  members,
  rosters,
  currentUserId,
  onStartDM,
}: LeagueMembersStripProps) {
  const activeMembers = members.filter((m) => m.role !== 'spectator');
  const emptyRosters = rosters.filter((r) => !r.owner_id);

  return (
    <div className="flex items-center gap-2 overflow-x-auto p-1">
      {activeMembers.map((member, i) => {
        const initial = (member.display_name || member.username).charAt(0).toUpperCase();
        const isMe = member.user_id === currentUserId;
        const colorClass = ACCENT_COLORS[i % ACCENT_COLORS.length];

        return (
          <button
            key={member.id}
            onClick={() => !isMe && onStartDM(member.user_id)}
            disabled={isMe}
            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold transition-transform hover:scale-110 disabled:hover:scale-100 ${colorClass} ${
              member.role === 'commissioner' ? 'ring-2 ring-neon-cyan glow-primary' : ''
            }`}
            title={`${member.display_name || member.username}${member.role === 'commissioner' ? ' (Commissioner)' : ''}${isMe ? ' (You)' : ''}`}
          >
            {initial}
          </button>
        );
      })}
      {emptyRosters.length > 0 && (
        <span className="flex-shrink-0 text-xs text-muted-foreground">
          +{emptyRosters.length} open
        </span>
      )}
    </div>
  );
}
