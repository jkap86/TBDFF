import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TradeService } from '../trades.service';
import { ValidationException, ConflictException } from '../../../shared/exceptions';

describe('TradeService.executeTrade duplicate guard', () => {
  let service: TradeService;
  let tradeRepo: any;
  let leagueRepo: any;
  let leagueRostersRepo: any;
  let capturedClient: any;

  beforeEach(() => {
    capturedClient = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    };

    tradeRepo = {
      findProposalById: vi.fn(),
      findProposalByIdForUpdate: vi.fn(),
      withTransaction: vi.fn(async (fn: any) => fn(capturedClient)),
      updateProposalStatusIfCurrent: vi.fn().mockResolvedValue(true),
    };

    leagueRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'league-1',
        rosterPositions: Array(15).fill('BN'),
        settings: {},
      }),
    };

    leagueRostersRepo = {
      findRosterByOwner: vi.fn(),
    };

    service = new TradeService(tradeRepo, leagueRepo, {} as any, leagueRostersRepo, {} as any, {} as any);
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
    tradeRepo.findProposalByIdForUpdate.mockResolvedValue(trade);

    leagueRostersRepo.findRosterByOwner
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
  let leagueRostersRepo: any;
  let capturedClient: any;

  beforeEach(() => {
    capturedClient = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    };

    tradeRepo = {
      findProposalById: vi.fn(),
      findProposalByIdForUpdate: vi.fn(),
      withTransaction: vi.fn(async (fn: any) => fn(capturedClient)),
      updateProposalStatusIfCurrent: vi.fn().mockResolvedValue(true),
    };

    leagueRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'league-1',
        rosterPositions: Array(15).fill('BN'),
        settings: {},
      }),
    };

    leagueRostersRepo = {
      findRosterByOwner: vi.fn(),
    };

    service = new TradeService(tradeRepo, leagueRepo, {} as any, leagueRostersRepo, {} as any, {} as any);
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
    tradeRepo.findProposalByIdForUpdate.mockResolvedValue(trade);

    leagueRostersRepo.findRosterByOwner
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

describe('TradeService.withdrawTrade', () => {
  let service: TradeService;
  let tradeRepo: any;
  let gateway: any;

  beforeEach(() => {
    tradeRepo = {
      findProposalById: vi.fn(),
      findProposalByIdForUpdate: vi.fn(),
      withTransaction: vi.fn(async (fn: any) => {
        const client = { query: vi.fn() };
        return fn(client);
      }),
      updateProposalStatusIfCurrent: vi.fn().mockResolvedValue(true),
    };

    gateway = {
      broadcastToLeague: vi.fn(),
      broadcastToUser: vi.fn(),
    };

    service = new TradeService(tradeRepo, {} as any, {} as any, {} as any, {} as any, {} as any);
    service.setGateway(gateway);
  });

  it('broadcasts trade:withdrawn after successful commit', async () => {
    const trade = {
      id: 'trade-1',
      leagueId: 'league-1',
      status: 'pending',
      proposedBy: 'user-a',
      proposedTo: 'user-b',
      toSafeObject: () => ({ id: 'trade-1', status: 'withdrawn' }),
    };

    tradeRepo.findProposalById.mockResolvedValue(trade);
    tradeRepo.findProposalByIdForUpdate.mockResolvedValue(trade);

    await service.withdrawTrade('trade-1', 'user-a');

    expect(gateway.broadcastToLeague).toHaveBeenCalledWith(
      'league-1',
      'trade:withdrawn',
      { trade: { id: 'trade-1', status: 'withdrawn' } },
    );
  });
});

describe('TradeService.executeTrade roster-size race', () => {
  let service: TradeService;
  let tradeRepo: any;
  let leagueRepo: any;
  let leagueRostersRepo: any;
  let capturedClient: any;

  beforeEach(() => {
    capturedClient = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    };

    tradeRepo = {
      findProposalById: vi.fn(),
      findProposalByIdForUpdate: vi.fn(),
      withTransaction: vi.fn(async (fn: any) => fn(capturedClient)),
      updateProposalStatusIfCurrent: vi.fn().mockResolvedValue(true),
    };

    leagueRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'league-1',
        rosterPositions: Array(15).fill('BN'),
        settings: {},
      }),
    };

    leagueRostersRepo = {
      findRosterByOwner: vi.fn(),
    };

    service = new TradeService(tradeRepo, leagueRepo, {} as any, leagueRostersRepo, {} as any, {} as any);
  });

  it('fails when locked roster is full (concurrent add filled the spot)', async () => {
    // Trade: receiver gives player-R to proposer (net +1 for proposer)
    const trade = {
      id: 'trade-1',
      leagueId: 'league-1',
      status: 'pending',
      proposedBy: 'user-a',
      proposedTo: 'user-b',
      items: [
        { itemType: 'player', playerId: 'player-R', side: 'receiver' },
      ],
      toSafeObject: () => ({}),
    };

    tradeRepo.findProposalById.mockResolvedValue(trade);
    tradeRepo.findProposalByIdForUpdate.mockResolvedValue(trade);

    // Pre-transaction: proposer has 14 players (one open spot) — passes early check
    leagueRostersRepo.findRosterByOwner
      .mockResolvedValueOnce({ rosterId: 101, players: Array(14).fill('x') })
      .mockResolvedValueOnce({ rosterId: 102, players: ['player-R'] });

    // Inside transaction after lock:
    capturedClient.query
      // SELECT ... FOR UPDATE (lock rows)
      .mockResolvedValueOnce({ rows: [{ id: 101 }, { id: 102 }] })
      // Re-validate proposer players — now FULL (15 players, concurrent add happened)
      .mockResolvedValueOnce({ rows: [{ players: Array(15).fill('x') }] })
      // Re-validate receiver players
      .mockResolvedValueOnce({ rows: [{ players: ['player-R'] }] });

    await expect(service.executeTrade('trade-1')).rejects.toThrow(
      'Trade would exceed roster size limit for proposer',
    );

    // No mutations should have been attempted (only the 3 SELECT queries above)
    const allSql = capturedClient.query.mock.calls.map((c: any[]) => c[0] as string);
    const mutationQueries = allSql.filter(
      (sql: string) => sql.includes('array_remove') || sql.includes('array_append') || sql.includes('INSERT INTO transactions'),
    );
    expect(mutationQueries).toHaveLength(0);
  });

  it('fails when locked receiver roster would exceed max after trade', async () => {
    // Trade: proposer gives player-P to receiver (net +1 for receiver)
    const trade = {
      id: 'trade-2',
      leagueId: 'league-1',
      status: 'pending',
      proposedBy: 'user-a',
      proposedTo: 'user-b',
      items: [
        { itemType: 'player', playerId: 'player-P', side: 'proposer' },
      ],
      toSafeObject: () => ({}),
    };

    tradeRepo.findProposalById.mockResolvedValue(trade);
    tradeRepo.findProposalByIdForUpdate.mockResolvedValue(trade);

    // Pre-transaction: receiver has 14 players (would pass early check)
    leagueRostersRepo.findRosterByOwner
      .mockResolvedValueOnce({ rosterId: 101, players: ['player-P'] })
      .mockResolvedValueOnce({ rosterId: 102, players: Array(14).fill('y') });

    capturedClient.query
      // SELECT ... FOR UPDATE
      .mockResolvedValueOnce({ rows: [{ id: 101 }, { id: 102 }] })
      // Locked proposer players
      .mockResolvedValueOnce({ rows: [{ players: ['player-P'] }] })
      // Locked receiver players — now full (15)
      .mockResolvedValueOnce({ rows: [{ players: Array(15).fill('y') }] });

    await expect(service.executeTrade('trade-2')).rejects.toThrow(
      'Trade would exceed roster size limit for receiver',
    );
  });
});

// ===== NEW: Concurrent status transition tests =====

describe('TradeService concurrent status transitions', () => {
  let service: TradeService;
  let tradeRepo: any;
  let leagueMembersRepo: any;

  beforeEach(() => {
    tradeRepo = {
      findProposalById: vi.fn(),
      findProposalByIdForUpdate: vi.fn(),
      withTransaction: vi.fn(async (fn: any) => {
        const client = { query: vi.fn() };
        return fn(client);
      }),
      updateProposalStatusIfCurrent: vi.fn().mockResolvedValue(true),
    };

    leagueMembersRepo = {
      findMember: vi.fn(),
    };

    service = new TradeService(tradeRepo, {} as any, leagueMembersRepo, {} as any, {} as any, {} as any);
  });

  it('withdraw fails with ConflictException when locked row is no longer pending (accept won)', async () => {
    // Outer read: trade is pending (stale snapshot)
    const staleTrade = {
      id: 'trade-1',
      leagueId: 'league-1',
      status: 'pending',
      proposedBy: 'user-a',
      proposedTo: 'user-b',
      toSafeObject: () => ({}),
    };

    // Locked read: trade is now 'review' (accept won the race)
    const lockedTrade = {
      ...staleTrade,
      status: 'review',
    };

    tradeRepo.findProposalById.mockResolvedValue(staleTrade);
    tradeRepo.findProposalByIdForUpdate.mockResolvedValue(lockedTrade);

    await expect(service.withdrawTrade('trade-1', 'user-a')).rejects.toThrow(ConflictException);
    await expect(service.withdrawTrade('trade-1', 'user-a')).rejects.toThrow(
      'Trade is no longer in a valid state for this action',
    );

    // updateProposalStatusIfCurrent should NOT have been called
    expect(tradeRepo.updateProposalStatusIfCurrent).not.toHaveBeenCalled();
  });

  it('decline fails with ConflictException when locked row is already withdrawn', async () => {
    const staleTrade = {
      id: 'trade-1',
      leagueId: 'league-1',
      status: 'pending',
      proposedBy: 'user-a',
      proposedTo: 'user-b',
      toSafeObject: () => ({}),
    };

    const lockedTrade = { ...staleTrade, status: 'withdrawn' };

    tradeRepo.findProposalById.mockResolvedValue(staleTrade);
    tradeRepo.findProposalByIdForUpdate.mockResolvedValue(lockedTrade);

    await expect(service.declineTrade('trade-1', 'user-b')).rejects.toThrow(ConflictException);
    expect(tradeRepo.updateProposalStatusIfCurrent).not.toHaveBeenCalled();
  });

  it('veto fails with ConflictException when locked row is already completed', async () => {
    const staleTrade = {
      id: 'trade-1',
      leagueId: 'league-1',
      status: 'review',
      proposedBy: 'user-a',
      proposedTo: 'user-b',
      toSafeObject: () => ({}),
    };

    const lockedTrade = { ...staleTrade, status: 'completed' };

    tradeRepo.findProposalById.mockResolvedValue(staleTrade);
    tradeRepo.findProposalByIdForUpdate.mockResolvedValue(lockedTrade);
    leagueMembersRepo.findMember.mockResolvedValue({ role: 'commissioner' });

    await expect(service.vetoTrade('trade-1', 'commish')).rejects.toThrow(ConflictException);
    expect(tradeRepo.updateProposalStatusIfCurrent).not.toHaveBeenCalled();
  });
});

describe('TradeService.executeTrade locked status check', () => {
  let service: TradeService;
  let tradeRepo: any;
  let leagueRepo: any;
  let leagueRostersRepo: any;
  let capturedClient: any;

  beforeEach(() => {
    capturedClient = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    };

    tradeRepo = {
      findProposalById: vi.fn(),
      findProposalByIdForUpdate: vi.fn(),
      withTransaction: vi.fn(async (fn: any) => fn(capturedClient)),
      updateProposalStatusIfCurrent: vi.fn().mockResolvedValue(true),
    };

    leagueRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'league-1',
        rosterPositions: Array(15).fill('BN'),
        settings: {},
      }),
    };

    leagueRostersRepo = {
      findRosterByOwner: vi.fn(),
    };

    service = new TradeService(tradeRepo, leagueRepo, {} as any, leagueRostersRepo, {} as any, {} as any);
  });

  it('does not move assets if locked proposal status is no longer executable', async () => {
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

    // Outer read sees pending
    tradeRepo.findProposalById.mockResolvedValue(trade);
    // Locked read sees withdrawn (race lost)
    tradeRepo.findProposalByIdForUpdate.mockResolvedValue({ ...trade, status: 'withdrawn' });

    leagueRostersRepo.findRosterByOwner
      .mockResolvedValueOnce({ rosterId: 101, players: ['player-1'] })
      .mockResolvedValueOnce({ rosterId: 102, players: [] });

    await expect(service.executeTrade('trade-1')).rejects.toThrow(ConflictException);

    // No roster queries should have been executed (no asset movement)
    expect(capturedClient.query).not.toHaveBeenCalled();
  });
});

// ===== NEW: Trade item validation tests =====

describe('TradeService.proposeTrade item validation', () => {
  let service: TradeService;
  let tradeRepo: any;
  let leagueRepo: any;
  let leagueMembersRepo: any;
  let leagueRostersRepo: any;

  beforeEach(() => {
    tradeRepo = {
      findProposalById: vi.fn(),
      findFuturePickById: vi.fn(),
      isDraftCompleteForPick: vi.fn().mockResolvedValue(false),
      withTransaction: vi.fn(async (fn: any) => {
        const client = { query: vi.fn() };
        return fn(client);
      }),
      createProposal: vi.fn().mockResolvedValue({ id: 'new-trade' }),
      createItems: vi.fn(),
    };

    leagueRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'league-1',
        settings: {},
      }),
    };

    leagueMembersRepo = {
      findMember: vi.fn().mockResolvedValue({ role: 'member' }),
    };

    leagueRostersRepo = {
      findRosterByOwner: vi.fn(),
    };

    service = new TradeService(tradeRepo, leagueRepo, leagueMembersRepo, leagueRostersRepo, {} as any, {} as any);
  });

  it('rejects proposal with duplicate player_id', async () => {
    leagueRostersRepo.findRosterByOwner
      .mockResolvedValueOnce({ rosterId: 101, players: ['player-1'] })
      .mockResolvedValueOnce({ rosterId: 102, players: ['player-2'] });

    await expect(
      service.proposeTrade('league-1', 'user-a', {
        proposed_to: 'user-b',
        items: [
          { side: 'proposer', item_type: 'player', player_id: 'player-1', roster_id: 101 },
          { side: 'receiver', item_type: 'player', player_id: 'player-2', roster_id: 102 },
          { side: 'proposer', item_type: 'player', player_id: 'player-1', roster_id: 101 },
        ],
      }),
    ).rejects.toThrow('Duplicate player in trade proposal: player-1');
  });

  it('rejects proposal with duplicate draft_pick_id', async () => {
    leagueRostersRepo.findRosterByOwner
      .mockResolvedValueOnce({ rosterId: 101, players: [] })
      .mockResolvedValueOnce({ rosterId: 102, players: [] });

    await expect(
      service.proposeTrade('league-1', 'user-a', {
        proposed_to: 'user-b',
        items: [
          { side: 'proposer', item_type: 'draft_pick', draft_pick_id: 'pick-1', roster_id: 101 },
          { side: 'receiver', item_type: 'draft_pick', draft_pick_id: 'pick-1', roster_id: 102 },
        ],
      }),
    ).rejects.toThrow('Duplicate draft pick in trade proposal: pick-1');
  });

  it('rejects proposal with roster_id that does not match proposer side', async () => {
    leagueRostersRepo.findRosterByOwner
      .mockResolvedValueOnce({ rosterId: 101, players: ['player-1'] })
      .mockResolvedValueOnce({ rosterId: 102, players: ['player-2'] });

    await expect(
      service.proposeTrade('league-1', 'user-a', {
        proposed_to: 'user-b',
        items: [
          { side: 'proposer', item_type: 'player', player_id: 'player-1', roster_id: 999 },
          { side: 'receiver', item_type: 'player', player_id: 'player-2', roster_id: 102 },
        ],
      }),
    ).rejects.toThrow('Item roster_id does not match the expected roster for proposer side');
  });

  it('rejects proposal with roster_id that does not match receiver side', async () => {
    leagueRostersRepo.findRosterByOwner
      .mockResolvedValueOnce({ rosterId: 101, players: ['player-1'] })
      .mockResolvedValueOnce({ rosterId: 102, players: ['player-2'] });

    await expect(
      service.proposeTrade('league-1', 'user-a', {
        proposed_to: 'user-b',
        items: [
          { side: 'proposer', item_type: 'player', player_id: 'player-1', roster_id: 101 },
          { side: 'receiver', item_type: 'player', player_id: 'player-2', roster_id: 999 },
        ],
      }),
    ).rejects.toThrow('Item roster_id does not match the expected roster for receiver side');
  });
});

describe('TradeService.counterTrade item validation', () => {
  let service: TradeService;
  let tradeRepo: any;
  let leagueRostersRepo: any;

  beforeEach(() => {
    tradeRepo = {
      findProposalById: vi.fn(),
      findProposalByIdForUpdate: vi.fn(),
      findFuturePickById: vi.fn(),
      isDraftCompleteForPick: vi.fn().mockResolvedValue(false),
      withTransaction: vi.fn(async (fn: any) => {
        const client = { query: vi.fn() };
        return fn(client);
      }),
      updateProposalStatusIfCurrent: vi.fn().mockResolvedValue(true),
      createProposal: vi.fn().mockResolvedValue({ id: 'counter-trade' }),
      createItems: vi.fn(),
    };

    leagueRostersRepo = {
      findRosterByOwner: vi.fn(),
    };

    service = new TradeService(tradeRepo, {} as any, {} as any, leagueRostersRepo, {} as any, {} as any);
  });

  it('rejects counter with duplicate player_id', async () => {
    const original = {
      id: 'trade-1',
      leagueId: 'league-1',
      status: 'pending',
      proposedBy: 'user-a',
      proposedTo: 'user-b',
    };

    tradeRepo.findProposalById.mockResolvedValue(original);
    tradeRepo.findProposalByIdForUpdate.mockResolvedValue(original);

    leagueRostersRepo.findRosterByOwner
      .mockResolvedValueOnce({ rosterId: 201, players: ['player-x'] })
      .mockResolvedValueOnce({ rosterId: 202, players: ['player-y'] });

    await expect(
      service.counterTrade('trade-1', 'user-b', {
        items: [
          { side: 'proposer', item_type: 'player', player_id: 'player-x', roster_id: 201 },
          { side: 'receiver', item_type: 'player', player_id: 'player-y', roster_id: 202 },
          { side: 'proposer', item_type: 'player', player_id: 'player-x', roster_id: 201 },
        ],
      }),
    ).rejects.toThrow('Duplicate player in trade proposal: player-x');
  });

  it('rejects counter with mismatched roster_id', async () => {
    const original = {
      id: 'trade-1',
      leagueId: 'league-1',
      status: 'pending',
      proposedBy: 'user-a',
      proposedTo: 'user-b',
    };

    tradeRepo.findProposalById.mockResolvedValue(original);
    tradeRepo.findProposalByIdForUpdate.mockResolvedValue(original);

    leagueRostersRepo.findRosterByOwner
      .mockResolvedValueOnce({ rosterId: 201, players: ['player-x'] })
      .mockResolvedValueOnce({ rosterId: 202, players: ['player-y'] });

    await expect(
      service.counterTrade('trade-1', 'user-b', {
        items: [
          { side: 'proposer', item_type: 'player', player_id: 'player-x', roster_id: 999 },
          { side: 'receiver', item_type: 'player', player_id: 'player-y', roster_id: 202 },
        ],
      }),
    ).rejects.toThrow('Item roster_id does not match the expected roster for proposer side');
  });
});
