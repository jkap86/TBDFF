'use client';

import { useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { authApi, leagueApi } from '@/lib/api';

const TEST_USERS = Array.from({ length: 12 }, (_, i) => `test${i + 1}`);
const PASSWORD = 'password';

export function DevPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(TEST_USERS));
  const { user, login } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Extract leagueId from URL like /leagues/[uuid]/...
  const leagueMatch = pathname.match(/\/leagues\/([0-9a-f-]{36})/);
  const leagueId = leagueMatch?.[1] ?? null;

  const addLog = useCallback((msg: string) => {
    setLog((prev) => [...prev.slice(-19), msg]);
  }, []);

  const toggleUser = useCallback((username: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(username)) next.delete(username);
      else next.add(username);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => setSelected(new Set(TEST_USERS)), []);
  const selectNone = useCallback(() => setSelected(new Set()), []);

  const handleLogin = useCallback(
    async (username: string) => {
      setBusy(username);
      try {
        await login(username, PASSWORD);
        addLog(`Logged in as ${username}`);
        router.refresh();
      } catch (e: any) {
        addLog(`Login failed: ${e.message ?? e}`);
      } finally {
        setBusy(null);
      }
    },
    [login, addLog, router],
  );

  const handleAddSelectedToLeague = useCallback(async () => {
    if (!leagueId || selected.size === 0) return;
    const usersToAdd = TEST_USERS.filter((u) => selected.has(u));
    setBusy('adding');
    addLog(`Adding ${usersToAdd.length} users to league...`);

    try {
      const userTokens: { username: string; token: string; userId: string }[] = [];

      for (const username of usersToAdd) {
        try {
          const result = await authApi.login(username, PASSWORD);
          userTokens.push({
            username,
            token: result.token,
            userId: result.user.id,
          });

          try {
            await leagueApi.join(leagueId, result.token);
            addLog(`${username} joined`);
          } catch (e: any) {
            if (e.message?.includes('Already')) {
              addLog(`${username} already in league`);
            } else {
              addLog(`${username} join failed: ${e.message}`);
            }
          }
        } catch (e: any) {
          addLog(`${username} login failed: ${e.message}`);
        }
      }

      // Find commissioner among the added users to assign rosters
      const commUser = userTokens.find((u) => u.username === 'test1');
      if (commUser) {
        addLog('Assigning rosters as commissioner...');
        // Get current rosters to find open slots
        const { rosters } = await leagueApi.getRosters(leagueId, commUser.token);
        const openSlots = rosters
          .filter((r) => !r.owner_id)
          .sort((a, b) => a.roster_id - b.roster_id);

        let slotIdx = 0;
        for (const u of userTokens) {
          if (u.username === 'test1') continue;
          if (slotIdx >= openSlots.length) break;
          try {
            await leagueApi.assignRoster(leagueId, openSlots[slotIdx].roster_id, { user_id: u.userId }, commUser.token);
            addLog(`${u.username} → roster ${openSlots[slotIdx].roster_id}`);
            slotIdx++;
          } catch (e: any) {
            if (e.message?.includes('already assigned')) {
              addLog(`${u.username} already has roster`);
            } else {
              addLog(`${u.username} roster failed: ${e.message}`);
            }
          }
        }
      } else {
        addLog('test1 not selected — skipping roster assignment');
      }

      addLog('Done! Refreshing...');
      router.refresh();
      window.location.reload();
    } catch (e: any) {
      addLog(`Error: ${e.message ?? e}`);
    } finally {
      setBusy(null);
    }
  }, [leagueId, selected, addLog, router]);

  if (process.env.NODE_ENV !== 'development') return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999]">
      {/* Toggle button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="rounded-full bg-purple-600 px-3 py-2 text-xs font-bold text-white shadow-lg hover:bg-purple-700"
        >
          DEV
        </button>
      )}

      {/* Panel */}
      {isOpen && (
        <div className="w-72 rounded-lg border border-gray-700 bg-gray-900 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-700 px-3 py-2">
            <span className="text-xs font-bold text-purple-400">
              DEV PANEL {user ? `(${user.username})` : ''}
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-500 hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* User buttons — click to login, checkbox to select for league */}
          <div className="border-b border-gray-700 px-3 py-2">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase text-gray-500">
                Test Users
              </p>
              <div className="flex gap-1">
                <button onClick={selectAll} className="text-[10px] text-gray-500 hover:text-gray-300">all</button>
                <span className="text-[10px] text-gray-700">/</span>
                <button onClick={selectNone} className="text-[10px] text-gray-500 hover:text-gray-300">none</button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {TEST_USERS.map((username) => (
                <div key={username} className="flex items-center gap-0.5">
                  <input
                    type="checkbox"
                    checked={selected.has(username)}
                    onChange={() => toggleUser(username)}
                    className="h-3 w-3 shrink-0 accent-purple-500"
                  />
                  <button
                    onClick={() => handleLogin(username)}
                    disabled={busy !== null}
                    className={`flex-1 rounded px-1 py-1 text-[11px] font-medium transition-colors ${
                      user?.username === username
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    } disabled:opacity-40`}
                  >
                    {busy === username ? '...' : username.replace('test', 't')}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* League actions */}
          <div className="border-b border-gray-700 px-3 py-2">
            <p className="mb-1 text-[10px] font-semibold uppercase text-gray-500">
              League Actions
            </p>
            {leagueId ? (
              <button
                onClick={handleAddSelectedToLeague}
                disabled={busy !== null || selected.size === 0}
                className="w-full rounded bg-green-700 px-2 py-1.5 text-xs font-medium text-white hover:bg-green-600 disabled:opacity-40"
              >
                {busy === 'adding'
                  ? 'Adding...'
                  : `Add Selected (${selected.size}) to League`}
              </button>
            ) : (
              <p className="text-[11px] text-gray-600">
                Navigate to a league page to add users
              </p>
            )}
          </div>

          {/* Log */}
          {log.length > 0 && (
            <div className="max-h-32 overflow-y-auto px-3 py-2">
              <p className="mb-1 text-[10px] font-semibold uppercase text-gray-500">
                Log
              </p>
              {log.map((msg, i) => (
                <p key={i} className="text-[10px] leading-tight text-gray-400">
                  {msg}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
