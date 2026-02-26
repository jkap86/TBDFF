import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TradeService } from '../trades.service';

describe('TradeService.executeTrade duplicate guard', () => {
  let service: TradeService;
  let tradeRepo: any;
  let leagueRepo: any;
  let draftRepo: any;
  let capturedClient: any;

  beforeEach(() => {
    capturedClient = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    };

    tradeRepo = {
      findProposalById: vi.fn(),
      withTransaction: vi.fn(async (fn: any) => fn(capturedClient)),
      updateProposalStatus: vi.fn(),
    };

    leagueRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'league-1',
        rosterPositions: Array(15).fill('BN'),
        settings: {},
      }),
      findRosterByOwner: vi.fn(),
    };

    draftRepo = {};

    service = new TradeService(tradeRepo, leagueRepo, draftRepo);
  });

  it('throws ValidationException when array_append returns rowCount 0 (duplicate player)', async () => {
    const trade = {
      id: 'trade-1',
      leagueId: 'league-1',
      status: 'pending',
      proposedBy: 'user-a',
      proposedTo: 'user-b',
      items: [
        { itemType: 'player', playerId: 'player-1', side: 'proposer' },
      ],
      toSafeObject: () => ({}),
    };

    tradeRepo.findProposalById.mockResolvedValue(trade);

    leagueRepo.findRosterByOwner
      .mockResolvedValueOnce({ rosterId: 101, players: ['player-1'] })
      .mockResolvedValueOnce({ rosterId: 102, players: [] });

    // SELECT ... FOR UPDATE (lock rows)
    capturedClient.query
      .mockResolvedValueOnce({ rows: [{ id: 101 }, { id: 102 }] })
      // Re-validate proposer players
      .mockResolvedValueOnce({ rows: [{ players: ['player-1'] }] })
      // Re-validate receiver players
      .mockResolvedValueOnce({ rows: [{ players: [] }] })
      // array_remove succeeds
      .mockResolvedValueOnce({ rowCount: 1 })
      // array_append returns 0 — player already on destination roster
      .mockResolvedValueOnce({ rowCount: 0 });

    await expect(service.executeTrade('trade-1')).rejects.toThrow(
      'Player player-1 is already on the destination roster',
    );
  });
});

describe('TradeService.executeTrade roster cleanup', () => {
  let service: TradeService;
  let tradeRepo: any;
  let leagueRepo: any;
  let draftRepo: any;
  let capturedClient: any;

  beforeEach(() => {
    capturedClient = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    };

    tradeRepo = {
      findProposalById: vi.fn(),
      withTransaction: vi.fn(async (fn: any) => fn(capturedClient)),
      updateProposalStatus: vi.fn(),
    };

    leagueRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'league-1',
        rosterPositions: Array(15).fill('BN'),
        settings: {},
      }),
      findRosterByOwner: vi.fn(),
    };

    draftRepo = {};

    service = new TradeService(tradeRepo, leagueRepo, draftRepo);
  });

  it('removes traded player from players, starters, reserve, and taxi arrays', async () => {
    const trade = {
      id: 'trade-1',
      leagueId: 'league-1',
      status: 'pending',
      proposedBy: 'user-a',
      proposedTo: 'user-b',
      items: [
        { itemType: 'player', playerId: 'player-1', side: 'proposer' },
        { itemType: 'player', playerId: 'player-2', side: 'receiver' },
      ],
      toSafeObject: () => ({}),
    };

    tradeRepo.findProposalById.mockResolvedValue(trade);

    leagueRepo.findRosterByOwner
      .mockResolvedValueOnce({ rosterId: 101, players: ['player-1'] })
      .mockResolvedValueOnce({ rosterId: 102, players: ['player-2'] });

    // SELECT ... FOR UPDATE (lock rows)
    capturedClient.query
      .mockResolvedValueOnce({ rows: [{ id: 101 }, { id: 102 }] })
      // Re-validate proposer players
      .mockResolvedValueOnce({ rows: [{ players: ['player-1'] }] })
      // Re-validate receiver players
      .mockResolvedValueOnce({ rows: [{ players: ['player-2'] }] })
      // proposer removal (player-1)
      .mockResolvedValueOnce({ rowCount: 1 })
      // proposer add to receiver
      .mockResolvedValueOnce({ rowCount: 1 })
      // receiver removal (player-2)
      .mockResolvedValueOnce({ rowCount: 1 })
      // receiver add to proposer
      .mockResolvedValueOnce({ rowCount: 1 })
      // INSERT INTO transactions
      .mockResolvedValueOnce({ rows: [{ id: 'tx-1' }] });

    await service.executeTrade('trade-1');

    // Extract all SQL strings from client.query calls
    const allSql = capturedClient.query.mock.calls.map((c: any[]) => c[0] as string);
    const removalQueries = allSql.filter((sql: string) => sql.includes('array_remove'));

    expect(removalQueries).toHaveLength(2);
    for (const sql of removalQueries) {
      expect(sql).toContain('array_remove(players');
      expect(sql).toContain('array_remove(starters');
      expect(sql).toContain('array_remove(reserve');
      expect(sql).toContain('array_remove(taxi');
    }
  });
});
