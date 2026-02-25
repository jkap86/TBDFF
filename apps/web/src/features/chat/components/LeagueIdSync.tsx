'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useChatPanel } from '../context/ChatPanelContext';

export function LeagueIdSync() {
  const params = useParams();
  const { setLeagueId } = useChatPanel();
  const leagueId = (params?.leagueId as string) ?? null;

  useEffect(() => {
    setLeagueId(leagueId);
  }, [leagueId, setLeagueId]);

  return null;
}
