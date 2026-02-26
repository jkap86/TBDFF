import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuctionService } from '../auction.service';
import { Draft, DEFAULT_DRAFT_SETTINGS, AuctionNomination } from '../drafts.model';

function makeDraft(overrides: Partial<ConstructorParameters<typeof Draft>> = {}): Draft {
  return new Draft(
    'draft-1',
    'league-1',
    '2025',
    'nfl',
    'drafting',
    'auction',
    null,
    null,
    { 'user-a': 1, 'user-b': 2 },
    { '1': 101, '2': 102 },
    { ...DEFAULT_DRAFT_SETTINGS, nomination_timer: 30, teams: 2 },
    {},
    'user-a',
    new Date(),
    new Date(),
  );
}

function makeNomination(overrides: Partial<AuctionNomination> = {}): AuctionNomination {
  return {
    pick_id: 'pick-1',
    player_id: 'player-1',
    nominated_by: 'user-a',
    current_bid: 5,
    current_bidder: 'user-a',
    bidder_roster_id: 101,
    bid_deadline: new Date(Date.now() + 30_000).toISOString(),
    bid_history: [{ user_id: 'user-a', amount: 5, timestamp: new Date().toISOString() }],
    player_metadata: { full_name: 'Test Player', position: 'QB' },
    ...overrides,
  };
}

describe('AuctionService.placeBid', () => {
  let service: AuctionService;
  let draftRepo: any;
  let leagueRepo: any;
  let playerRepo: any;

  beforeEach(() => {
    draftRepo = {
      findById: vi.fn(),
      update: vi.fn(),
      countPicksWonByRoster: vi.fn().mockResolvedValue(0),
      withTransaction: vi.fn(async (fn: any) => {
        const mockClient = { query: vi.fn() };
        return fn(mockClient);
      }),
    };

    leagueRepo = {
      findMember: vi.fn().mockResolvedValue({ role: 'member' }),
    };

    playerRepo = {};

    service = new AuctionService(draftRepo, leagueRepo, playerRepo);
  });

  it('acquires advisory lock via withTransaction and re-reads draft', async () => {
    const nomination = makeNomination({ current_bid: 5, current_bidder: 'user-a' });
    const draft = makeDraft();
    (draft as any).metadata = {
      current_nomination: nomination,
      auction_budgets: { '101': 200, '102': 200 },
    };

    draftRepo.findById
      .mockResolvedValueOnce(draft) // pre-check
      .mockResolvedValueOnce(draft); // inside tx

    const updatedDraft = makeDraft();
    draftRepo.update.mockResolvedValue(updatedDraft);

    const result = await service.placeBid('draft-1', 'user-b', 10);

    // withTransaction was called
    expect(draftRepo.withTransaction).toHaveBeenCalledTimes(1);

    // Advisory lock was acquired (mockClient.query called with lock SQL)
    const txFn = draftRepo.withTransaction.mock.calls[0][0];
    const mockClient = { query: vi.fn() };
    draftRepo.findById.mockResolvedValueOnce(draft);
    draftRepo.update.mockResolvedValue(updatedDraft);
    await txFn(mockClient);
    expect(mockClient.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['draft-1'],
    );

    // findById was called with client (second call inside tx)
    const insideTxCall = draftRepo.findById.mock.calls.find(
      (call: any[]) => call.length === 2 && call[1] !== undefined,
    );
    expect(insideTxCall).toBeDefined();
  });

  it('re-validates bid amount under lock to prevent stale-read clobber', async () => {
    const nomination = makeNomination({ current_bid: 5, current_bidder: 'user-a' });
    const draft = makeDraft();
    (draft as any).metadata = {
      current_nomination: nomination,
      auction_budgets: { '101': 200, '102': 200 },
    };

    // Pre-check sees bid=5, but by the time the lock is acquired, bid is already 8
    const freshNomination = makeNomination({ current_bid: 8, current_bidder: 'user-c' });
    const freshDraft = makeDraft();
    (freshDraft as any).metadata = {
      current_nomination: freshNomination,
      auction_budgets: { '101': 200, '102': 200 },
    };

    draftRepo.findById
      .mockResolvedValueOnce(draft) // pre-check
      .mockResolvedValueOnce(freshDraft); // inside tx re-read

    // Bid of 7 was valid against stale state (>5) but not against fresh state (>8)
    await expect(service.placeBid('draft-1', 'user-b', 7)).rejects.toThrow(
      'Bid must be greater than $8',
    );
  });

  it('passes client to update for transactional write', async () => {
    const nomination = makeNomination({ current_bid: 5, current_bidder: 'user-a' });
    const draft = makeDraft();
    (draft as any).metadata = {
      current_nomination: nomination,
      auction_budgets: { '101': 200, '102': 200 },
    };

    draftRepo.findById.mockResolvedValue(draft);

    const updatedDraft = makeDraft();
    draftRepo.update.mockResolvedValue(updatedDraft);

    await service.placeBid('draft-1', 'user-b', 10);

    // update should be called with 3 args (id, data, client)
    const updateCall = draftRepo.update.mock.calls[0];
    expect(updateCall).toHaveLength(3);
    expect(updateCall[2]).toBeDefined(); // client is passed
  });
});

describe('AuctionService.resolveNomination', () => {
  let service: AuctionService;
  let draftRepo: any;
  let leagueRepo: any;
  let playerRepo: any;

  beforeEach(() => {
    draftRepo = {
      findById: vi.fn(),
      update: vi.fn(),
      makeAuctionPick: vi.fn(),
      deductBudget: vi.fn(),
      completeAndUpdateLeagueInTx: vi.fn(),
      countPicksWonByRoster: vi.fn().mockResolvedValue(0),
      countPicksWonByRosters: vi.fn().mockResolvedValue(new Map()),
      withTransaction: vi.fn(async (fn: any) => {
        const mockClient = { query: vi.fn() };
        return fn(mockClient);
      }),
    };

    leagueRepo = {
      findMember: vi.fn().mockResolvedValue({ role: 'member' }),
    };

    playerRepo = {};

    service = new AuctionService(draftRepo, leagueRepo, playerRepo);
  });

  it('resolves pick, deducts budget, and sets next nomination in one transaction', async () => {
    const nomination = makeNomination({
      current_bid: 10,
      current_bidder: 'user-b',
      bidder_roster_id: 102,
      bid_deadline: new Date(Date.now() - 5000).toISOString(),
    });
    const draft = makeDraft();
    (draft as any).metadata = {
      current_nomination: nomination,
      auction_budgets: { '101': 200, '102': 200 },
    };

    draftRepo.findById.mockResolvedValue(draft);

    const pick = { id: 'pick-1', playerId: 'player-1' };
    draftRepo.makeAuctionPick.mockResolvedValue(pick);

    const afterDeduct = makeDraft();
    (afterDeduct as any).metadata = { auction_budgets: { '101': 200, '102': 190 } };
    draftRepo.deductBudget.mockResolvedValue(afterDeduct);

    draftRepo.completeAndUpdateLeagueInTx.mockResolvedValue(null); // not complete yet
    draftRepo.update.mockResolvedValue(draft);

    const result = await service.resolveNomination('draft-1', 'user-a');

    // All operations happen inside one withTransaction call
    expect(draftRepo.withTransaction).toHaveBeenCalledTimes(1);
    expect(result.won).toBeDefined();

    // makeAuctionPick, deductBudget, and update all receive a client arg
    const pickCall = draftRepo.makeAuctionPick.mock.calls[0];
    expect(pickCall[pickCall.length - 1]).toBeDefined(); // client
    const deductCall = draftRepo.deductBudget.mock.calls[0];
    expect(deductCall[deductCall.length - 1]).toBeDefined(); // client
  });

  it('returns idempotently if nomination was already resolved', async () => {
    const draft = makeDraft();
    (draft as any).metadata = { current_nomination: null }; // already cleared

    draftRepo.findById.mockResolvedValue(draft);

    const result = await service.resolveNomination('draft-1', 'user-a');

    expect(result.won).toBeUndefined();
    expect(draftRepo.makeAuctionPick).not.toHaveBeenCalled();
  });

  it('throws when deductBudget fails (budget rollback)', async () => {
    const nomination = makeNomination({
      current_bid: 999,
      current_bidder: 'user-b',
      bidder_roster_id: 102,
      bid_deadline: new Date(Date.now() - 5000).toISOString(),
    });
    const draft = makeDraft();
    (draft as any).metadata = {
      current_nomination: nomination,
      auction_budgets: { '101': 200, '102': 200 },
    };

    draftRepo.findById.mockResolvedValue(draft);
    draftRepo.makeAuctionPick.mockResolvedValue({ id: 'pick-1' });
    draftRepo.deductBudget.mockResolvedValue(null); // budget insufficient

    await expect(service.resolveNomination('draft-1', 'user-a')).rejects.toThrow(
      'Budget deduction failed',
    );
  });
});
