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
