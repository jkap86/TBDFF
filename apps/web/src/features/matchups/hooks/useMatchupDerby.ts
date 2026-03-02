'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useSocket } from '@/features/chat/context/SocketProvider';
import type { MatchupDerbyState, MatchupDerbyPickRequest, LeagueMember, Roster } from '@tbdff/shared';
import { matchupApi, leagueApi } from '@tbdff/shared';

interface UseMatchupDerbyReturn {
  derby: MatchupDerbyState | null;
  members: LeagueMember[];
  rosters: Roster[];
  isLoading: boolean;
  error: string | null;
  timeRemaining: number | null;
  isPicking: boolean;
  pickError: string | null;
  isMyTurn: boolean;
  currentPickerUserId: string | null;
  handleStartDerby: () => Promise<void>;
  handleMakePick: (opponentRosterId: number, week: number) => Promise<void>;
  handleAutoPick: () => Promise<void>;
  formatTime: (seconds: number) => string;
}

export function useMatchupDerby(leagueId: string): UseMatchupDerbyReturn {
  const { accessToken, user } = useAuth();
  const { socket, isConnected } = useSocket();

  const [derby, setDerby] = useState<MatchupDerbyState | null>(null);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  const clockOffsetRef = useRef(0);
  const autoPickTriggered = useRef(false);

  const updateClockOffset = useCallback((serverTime: string) => {
    const serverTs = new Date(serverTime).getTime();
    if (!isNaN(serverTs)) {
      clockOffsetRef.current = serverTs - Date.now();
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (!accessToken) return;

    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [derbyRes, membersRes, rostersRes] = await Promise.all([
          matchupApi.getDerby(leagueId, accessToken),
          leagueApi.getMembers(leagueId, accessToken),
          leagueApi.getRosters(leagueId, accessToken),
        ]);

        if (derbyRes.derby) {
          setDerby(derbyRes.derby);
          updateClockOffset(derbyRes.server_time);
        }
        setMembers(membersRes.members);
        setRosters(rostersRes.rosters);
      } catch (err: any) {
        setError(err.message ?? 'Failed to load matchup derby');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [leagueId, accessToken, updateClockOffset]);

  // Socket subscription
  useEffect(() => {
    if (!socket || !isConnected) return;

    socket.emit('matchup_derby:join', leagueId);

    const handleUpdate = (data: { derby: MatchupDerbyState; server_time: string }) => {
      setDerby(data.derby);
      updateClockOffset(data.server_time);
      autoPickTriggered.current = false;
    };

    socket.on('matchup_derby:state_updated', handleUpdate);

    return () => {
      socket.off('matchup_derby:state_updated', handleUpdate);
      socket.emit('matchup_derby:leave', leagueId);
    };
  }, [socket, isConnected, leagueId, updateClockOffset]);

  // Timer countdown
  useEffect(() => {
    if (!derby || derby.status !== 'active' || !derby.pick_deadline) {
      setTimeRemaining(null);
      return;
    }

    autoPickTriggered.current = false;
    const deadline = new Date(derby.pick_deadline).getTime();
    const clientNow = () => Date.now() + clockOffsetRef.current;

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - clientNow()) / 1000));
      setTimeRemaining(remaining);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [derby?.status, derby?.pick_deadline]);

  // Auto-pick on timer expiry
  useEffect(() => {
    if (timeRemaining !== 0 || !derby || derby.status !== 'active') return;
    if (autoPickTriggered.current) return;
    if (!accessToken) return;

    autoPickTriggered.current = true;
    matchupApi.derbyAutoPick(leagueId, accessToken).catch(() => {
      // Server-side validation will reject if already handled
    });
  }, [timeRemaining, derby?.status, leagueId, accessToken]);

  // Fallback polling
  useEffect(() => {
    if (!accessToken || !derby || derby.status !== 'active') return;

    const poll = setInterval(async () => {
      try {
        const res = await matchupApi.getDerby(leagueId, accessToken);
        if (res.derby) {
          setDerby(res.derby);
          updateClockOffset(res.server_time);
        }
      } catch {
        // Silent
      }
    }, 10000);

    return () => clearInterval(poll);
  }, [accessToken, leagueId, derby?.status, updateClockOffset]);

  // Compute current picker
  const getCurrentPickerUserId = useCallback((): string | null => {
    if (!derby || derby.status !== 'active') return null;
    const teamCount = derby.derby_order.length;
    if (teamCount === 0) return null;

    const pickIndex = derby.current_pick_index;
    if (pickIndex >= derby.total_picks) return null;

    const round = Math.floor(pickIndex / teamCount);
    const posInRound = pickIndex % teamCount;
    const isReversed = round % 2 === 1;
    const orderIndex = isReversed ? teamCount - 1 - posInRound : posInRound;

    return derby.derby_order[orderIndex]?.user_id ?? null;
  }, [derby]);

  const currentPickerUserId = getCurrentPickerUserId();
  const isMyTurn = currentPickerUserId === user?.id || (derby?.skipped_users?.includes(user?.id ?? '') ?? false);

  const handleStartDerby = useCallback(async () => {
    if (!accessToken) return;
    try {
      setError(null);
      const res = await matchupApi.startDerby(leagueId, accessToken);
      setDerby(res.derby);
      updateClockOffset(res.server_time);
    } catch (err: any) {
      setError(err.message ?? 'Failed to start matchup derby');
    }
  }, [accessToken, leagueId, updateClockOffset]);

  const handleMakePick = useCallback(async (opponentRosterId: number, week: number) => {
    if (!accessToken) return;
    try {
      setIsPicking(true);
      setPickError(null);
      const body: MatchupDerbyPickRequest = { opponent_roster_id: opponentRosterId, week };
      const res = await matchupApi.makeDerbyPick(leagueId, body, accessToken);
      setDerby(res.derby);
      updateClockOffset(res.server_time);
    } catch (err: any) {
      setPickError(err.message ?? 'Failed to make pick');
    } finally {
      setIsPicking(false);
    }
  }, [accessToken, leagueId, updateClockOffset]);

  const handleAutoPick = useCallback(async () => {
    if (!accessToken) return;
    try {
      setPickError(null);
      const res = await matchupApi.derbyAutoPick(leagueId, accessToken);
      setDerby(res.derby);
      updateClockOffset(res.server_time);
    } catch (err: any) {
      setPickError(err.message ?? 'Failed to auto-pick');
    }
  }, [accessToken, leagueId, updateClockOffset]);

  const formatTime = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);

  return {
    derby,
    members,
    rosters,
    isLoading,
    error,
    timeRemaining,
    isPicking,
    pickError,
    isMyTurn,
    currentPickerUserId,
    handleStartDerby,
    handleMakePick,
    handleAutoPick,
    formatTime,
  };
}
