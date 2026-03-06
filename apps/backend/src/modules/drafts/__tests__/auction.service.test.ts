import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuctionService } from '../auction.service';
import { AuctionAutoBidService } from '../auction-auto-bid.service';
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
  let draftTimerRepo: any;
  let draftQueueRepo: any;
  let leagueRepo: any;
  let playerRepo: any;
  let autoBidService: AuctionAutoBidService;

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

    draftTimerRepo = {
      upsertAuctionTimer: vi.fn().mockResolvedValue(undefined),
      cancelAuctionTimers: vi.fn().mockResolvedValue(undefined),
    };

    draftQueueRepo = {};

    leagueRepo = {
      findMember: vi.fn().mockResolvedValue({ role: 'member' }),
    };

    playerRepo = {};

    autoBidService = new AuctionAutoBidService(draftRepo, draftTimerRepo, draftQueueRepo, leagueRepo, playerRepo);
    service = new AuctionService(draftRepo, draftQueueRepo, leagueRepo, playerRepo, autoBidService);
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
  let draftTimerRepo: any;
  let draftQueueRepo: any;
  let leagueRepo: any;
  let playerRepo: any;
  let autoBidService: AuctionAutoBidService;

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

    draftTimerRepo = {
      upsertAuctionTimer: vi.fn().mockResolvedValue(undefined),
      cancelAuctionTimers: vi.fn().mockResolvedValue(undefined),
    };

    draftQueueRepo = {};

    leagueRepo = {
      findMember: vi.fn().mockResolvedValue({ role: 'member' }),
    };

    playerRepo = {};

    autoBidService = new AuctionAutoBidService(draftRepo, draftTimerRepo, draftQueueRepo, leagueRepo, playerRepo);
    service = new AuctionService(draftRepo, draftQueueRepo, leagueRepo, playerRepo, autoBidService);
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

describe('AuctionAutoBidService._processAutoBids (incremental bidding)', () => {
  let autoBidService: AuctionAutoBidService;
  let draftRepo: any;
  let draftTimerRepo: any;
  let draftQueueRepo: any;
  let leagueRepo: any;
  let playerRepo: any;

  beforeEach(() => {
    draftRepo = {
      findById: vi.fn(),
      update: vi.fn(),
      countPicksWonByRoster: vi.fn().mockResolvedValue(0),
      countPicksWonByRosters: vi.fn().mockResolvedValue(new Map()),
      withTransaction: vi.fn(async (fn: any) => {
        const mockClient = { query: vi.fn() };
        return fn(mockClient);
      }),
    };

    draftTimerRepo = {
      upsertAuctionTimer: vi.fn().mockResolvedValue(undefined),
      cancelAuctionTimers: vi.fn().mockResolvedValue(undefined),
    };

    draftQueueRepo = {
      getQueueItemsForPlayerByUsers: vi.fn().mockResolvedValue(new Map()),
      getUserIdsWithMaxBidForPlayer: vi.fn().mockResolvedValue([]),
    };

    leagueRepo = {
      findMember: vi.fn().mockResolvedValue({ role: 'member' }),
    };

    playerRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'player-1',
        auctionValue: 40,
        searchRank: 5,
      }),
    };

    autoBidService = new AuctionAutoBidService(draftRepo, draftTimerRepo, draftQueueRepo, leagueRepo, playerRepo);
  });

  function makeAutoBidDraft(
    overrides: {
      currentBid?: number;
      currentBidder?: string;
      autoPickUsers?: string[];
      budgets?: Record<string, number>;
    } = {},
  ) {
    const {
      currentBid = 5,
      currentBidder = 'user-a',
      autoPickUsers = ['user-b'],
      budgets = { '101': 200, '102': 200 },
    } = overrides;
    const nomination = makeNomination({
      current_bid: currentBid,
      current_bidder: currentBidder,
      bidder_roster_id: currentBidder === 'user-a' ? 101 : 102,
    });
    // Use teams=12 so the 80% AAV formula produces realistic targets
    const draft = new Draft(
      'draft-1', 'league-1', '2025', 'nfl', 'drafting', 'auction',
      null, null,
      { 'user-a': 1, 'user-b': 2 },
      { '1': 101, '2': 102 },
      { ...DEFAULT_DRAFT_SETTINGS, nomination_timer: 30, teams: 12 },
      {
        current_nomination: nomination,
        auto_pick_users: autoPickUsers,
        auction_budgets: budgets,
      },
      'user-a', new Date(), new Date(),
    );
    return draft;
  }

  it('single auto-bidder outbids human at currentBid + 1', async () => {
    // Human user-a has bid $5, auto-pick user-b has target ~$32 (80% of auctionValue 40)
    const draft = makeAutoBidDraft({
      currentBid: 5,
      currentBidder: 'user-a',
      autoPickUsers: ['user-b'],
    });
    draftRepo.findById.mockResolvedValue(draft);
    draftRepo.update.mockResolvedValue(draft);

    // Trigger processAutoBids via public scheduleAutoBids
    await (autoBidService as any)._processAutoBids('draft-1');

    const updateCall = draftRepo.update.mock.calls[0];
    const nom = updateCall[1].metadata.current_nomination;
    // With no other auto-bidder, bid is just currentBid + 1
    expect(nom.current_bid).toBe(6);
    expect(nom.current_bidder).toBe('user-b');
  });

  it('two auto-bidders bid incrementally at currentBid + 1', async () => {
    // user-a bid $5 and is current bidder. Both user-a and user-b are on auto.
    // Both have target=32 (80% of auctionValue 40 with teams=12, budget=200).
    // user-b (challenger) bids currentBid + 1 = 6; scheduleAutoBids handles the rest.
    const draft = makeAutoBidDraft({
      currentBid: 5,
      currentBidder: 'user-a',
      autoPickUsers: ['user-a', 'user-b'],
    });
    draftRepo.findById.mockResolvedValue(draft);
    draftRepo.update.mockResolvedValue(draft);

    await (autoBidService as any)._processAutoBids('draft-1');

    const updateCall = draftRepo.update.mock.calls[0];
    const nom = updateCall[1].metadata.current_nomination;
    expect(nom.current_bidder).toBe('user-b');
    expect(nom.current_bid).toBe(6);
  });

  it('does nothing when highest auto-bidder is already the current bidder', async () => {
    // user-b is the current bidder and also the only auto-pick user
    const draft = makeAutoBidDraft({
      currentBid: 10,
      currentBidder: 'user-b',
      autoPickUsers: ['user-b'],
    });
    draftRepo.findById.mockResolvedValue(draft);

    const result = await (autoBidService as any)._processAutoBids('draft-1');

    expect(result).toBeNull();
    expect(draftRepo.update).not.toHaveBeenCalled();
  });

  it('uses queue max_bid when player is in auto-bidder queue', async () => {
    const draft = makeAutoBidDraft({
      currentBid: 5,
      currentBidder: 'user-a',
      autoPickUsers: ['user-b'],
    });
    draftRepo.findById.mockResolvedValue(draft);
    draftRepo.update.mockResolvedValue(draft);

    // user-b has player in queue with max_bid = 15
    draftQueueRepo.getQueueItemsForPlayerByUsers.mockResolvedValue(
      new Map([['user-b', { max_bid: 15 }]]),
    );

    await (autoBidService as any)._processAutoBids('draft-1');

    const updateCall = draftRepo.update.mock.calls[0];
    const nom = updateCall[1].metadata.current_nomination;
    // Single auto-bidder with target 15 → bid = currentBid + 1 = 6
    expect(nom.current_bid).toBe(6);
  });

  it('two auto-bidders with different queue max_bids bid incrementally', async () => {
    const draft = makeAutoBidDraft({
      currentBid: 1,
      currentBidder: 'user-a',
      autoPickUsers: ['user-a', 'user-b'],
      budgets: { '101': 200, '102': 200 },
    });
    draftRepo.findById.mockResolvedValue(draft);
    draftRepo.update.mockResolvedValue(draft);

    // user-a has max_bid 20, user-b has max_bid 50
    draftQueueRepo.getQueueItemsForPlayerByUsers.mockResolvedValue(
      new Map([
        ['user-a', { max_bid: 20 }],
        ['user-b', { max_bid: 50 }],
      ]),
    );

    await (autoBidService as any)._processAutoBids('draft-1');

    const updateCall = draftRepo.update.mock.calls[0];
    const nom = updateCall[1].metadata.current_nomination;
    // user-b (challenger) bids currentBid + 1 = 2; scheduleAutoBids continues the war.
    expect(nom.current_bidder).toBe('user-b');
    expect(nom.current_bid).toBe(2);
  });

  it('non-auto-pick user with queue max_bid should auto-bid', async () => {
    // user-a nominated at $1, user-b bid $2. user-a set max_bid=20 but is NOT in auto_pick_users.
    const draft = makeAutoBidDraft({
      currentBid: 2,
      currentBidder: 'user-b',
      autoPickUsers: [],
    });
    draftRepo.findById.mockResolvedValue(draft);
    draftRepo.update.mockResolvedValue(draft);

    // user-a has a queue max_bid for this player
    draftQueueRepo.getUserIdsWithMaxBidForPlayer.mockResolvedValue(['user-a']);
    draftQueueRepo.getQueueItemsForPlayerByUsers.mockResolvedValue(
      new Map([['user-a', { max_bid: 20 }]]),
    );

    await (autoBidService as any)._processAutoBids('draft-1');

    const updateCall = draftRepo.update.mock.calls[0];
    const nom = updateCall[1].metadata.current_nomination;
    expect(nom.current_bid).toBe(3);
    expect(nom.current_bidder).toBe('user-a');
  });

  it('non-auto-pick user without queue max_bid does not auto-bid', async () => {
    // user-a is returned by getUserIdsWithMaxBidForPlayer but their queue entry has no max_bid
    // (edge case: max_bid was cleared between the two queries)
    const draft = makeAutoBidDraft({
      currentBid: 2,
      currentBidder: 'user-b',
      autoPickUsers: [],
    });
    draftRepo.findById.mockResolvedValue(draft);

    draftQueueRepo.getUserIdsWithMaxBidForPlayer.mockResolvedValue(['user-a']);
    draftQueueRepo.getQueueItemsForPlayerByUsers.mockResolvedValue(
      new Map([['user-a', { max_bid: null }]]),
    );

    const result = await (autoBidService as any)._processAutoBids('draft-1');

    expect(result).toBeNull();
    expect(draftRepo.update).not.toHaveBeenCalled();
  });
});

describe('AuctionService.autoNominate', () => {
  let service: AuctionService;
  let draftRepo: any;
  let draftTimerRepo: any;
  let draftQueueRepo: any;
  let leagueRepo: any;
  let playerRepo: any;
  let capturedClient: any;

  const bestPlayer = {
    id: 'player-99',
    firstName: 'Test',
    lastName: 'Player',
    fullName: 'Test Player',
    position: 'RB',
    team: 'NYG',
    auctionValue: 25,
  };

  beforeEach(() => {
    capturedClient = { query: vi.fn() };

    draftRepo = {
      findById: vi.fn(),
      update: vi.fn(),
      findNextPick: vi.fn(),
      addAutoPickUser: vi.fn().mockResolvedValue(null),
      countPicksWonByRoster: vi.fn().mockResolvedValue(0),
      countPicksWonByRosters: vi.fn().mockResolvedValue(new Map()),
      findBestAvailable: vi.fn().mockResolvedValue(bestPlayer),
      forfeitPick: vi.fn(),
      completeAndUpdateLeagueInTx: vi.fn(),
      withTransaction: vi.fn(async (fn: any) => fn(capturedClient)),
    };

    draftTimerRepo = {
      upsertAuctionTimer: vi.fn().mockResolvedValue(undefined),
      cancelAuctionTimers: vi.fn().mockResolvedValue(undefined),
    };

    draftQueueRepo = {
      findFirstAvailableFromQueue: vi.fn().mockResolvedValue(null),
    };

    leagueRepo = {
      findMember: vi.fn().mockResolvedValue({ role: 'member' }),
    };

    playerRepo = {};

    const autoBidService = new AuctionAutoBidService(draftRepo, draftTimerRepo, draftQueueRepo, leagueRepo, playerRepo);
    service = new AuctionService(draftRepo, draftQueueRepo, leagueRepo, playerRepo, autoBidService);
  });

  it('acquires advisory lock and re-reads draft inside transaction', async () => {
    const draft = makeDraft();
    (draft as any).metadata = {
      current_nomination: null,
      nomination_deadline: new Date(Date.now() - 5000).toISOString(),
      auction_budgets: { '101': 200, '102': 200 },
    };

    draftRepo.findById.mockResolvedValue(draft);
    draftRepo.findNextPick.mockResolvedValue({ id: 'pick-1', draftSlot: 1 });

    const updatedDraft = makeDraft();
    draftRepo.update.mockResolvedValue(updatedDraft);

    await service.autoNominate('draft-1', 'user-a');

    expect(draftRepo.withTransaction).toHaveBeenCalledTimes(1);
    expect(capturedClient.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['draft-1'],
    );
    // findById called with client inside tx
    const insideTxCall = draftRepo.findById.mock.calls.find(
      (call: any[]) => call.length === 2 && call[1] === capturedClient,
    );
    expect(insideTxCall).toBeDefined();
  });

  it('validates budget and falls back to eligible bidder when slot owner cannot afford $1', async () => {
    const draft = makeDraft();
    // Slot 1 owned by user-a with roster 101, budget only enough for reserve (no extra for bid)
    // 2 teams, rounds=15, max_players_per_team=0 (falls back to rounds=15)
    // user-a has won 14 picks, remaining=1, reserve=0, maxBid=budget=1 — but budget is 0
    (draft as any).metadata = {
      current_nomination: null,
      nomination_deadline: new Date(Date.now() - 5000).toISOString(),
      auction_budgets: { '101': 0, '102': 200 },
    };

    draftRepo.findById.mockResolvedValue(draft);
    draftRepo.findNextPick.mockResolvedValue({ id: 'pick-1', draftSlot: 1 });
    // user-a won 0 picks but has $0 budget; reserve=14 slots, maxBid=0-14=-14 → bid of $1 fails
    draftRepo.countPicksWonByRoster.mockResolvedValue(0);

    const updatedDraft = makeDraft();
    draftRepo.update.mockResolvedValue(updatedDraft);

    await service.autoNominate('draft-1', 'user-a');

    // update should have been called with user-b as bidder (fallback)
    const updateCall = draftRepo.update.mock.calls[0];
    const nominationData = updateCall[1].metadata.current_nomination;
    expect(nominationData.current_bidder).toBe('user-b');
    expect(nominationData.bidder_roster_id).toBe(102);
  });

  it('throws when no slot owner and no eligible bidder exists', async () => {
    // Draft with a slot that has no user mapped
    const draft = new Draft(
      'draft-1', 'league-1', '2025', 'nfl', 'drafting', 'auction',
      null, null,
      { 'user-a': 1 }, // only slot 1 mapped
      { '1': 101, '2': 102 }, // slot 2 has a roster but no user
      { ...DEFAULT_DRAFT_SETTINGS, nomination_timer: 30, teams: 2 },
      {
        current_nomination: null,
        nomination_deadline: new Date(Date.now() - 5000).toISOString(),
        auction_budgets: { '101': 0, '102': 0 },
      },
      'user-a', new Date(), new Date(),
    );

    draftRepo.findById.mockResolvedValue(draft);
    draftRepo.findNextPick.mockResolvedValue({ id: 'pick-2', draftSlot: 2 });
    draftRepo.countPicksWonByRoster.mockResolvedValue(0);
    // All rosters have $0 budget — no eligible bidder
    draftRepo.countPicksWonByRosters.mockResolvedValue(new Map());

    leagueRepo.findMember.mockResolvedValue({ role: 'commissioner' });

    await expect(service.autoNominate('draft-1', 'user-a')).rejects.toThrow(
      'No eligible bidder available',
    );
  });

  it('passes client to all repo calls inside transaction', async () => {
    const draft = makeDraft();
    (draft as any).metadata = {
      current_nomination: null,
      nomination_deadline: new Date(Date.now() - 5000).toISOString(),
      auction_budgets: { '101': 200, '102': 200 },
    };

    draftRepo.findById.mockResolvedValue(draft);
    draftRepo.findNextPick.mockResolvedValue({ id: 'pick-1', draftSlot: 1 });

    const updatedDraft = makeDraft();
    draftRepo.update.mockResolvedValue(updatedDraft);

    await service.autoNominate('draft-1', 'user-a');

    // findNextPick called with client
    const nextPickCall = draftRepo.findNextPick.mock.calls[0];
    expect(nextPickCall[1]).toBe(capturedClient);

    // addAutoPickUser called with client
    const autoPickCall = draftRepo.addAutoPickUser.mock.calls[0];
    expect(autoPickCall[2]).toBe(capturedClient);

    // countPicksWonByRoster called with client
    const countCall = draftRepo.countPicksWonByRoster.mock.calls[0];
    expect(countCall[2]).toBe(capturedClient);

    // update called with client
    const updateCall = draftRepo.update.mock.calls[0];
    expect(updateCall[2]).toBe(capturedClient);
  });

  it('rejects concurrent auto-nominate when nomination became active under lock', async () => {
    const draft = makeDraft();
    (draft as any).metadata = { current_nomination: null };

    // Pre-check: no nomination. Under lock: nomination appeared
    const freshDraft = makeDraft();
    (freshDraft as any).metadata = { current_nomination: makeNomination() };

    draftRepo.findById
      .mockResolvedValueOnce(draft) // pre-check
      .mockResolvedValueOnce(freshDraft); // inside tx

    await expect(service.autoNominate('draft-1', 'user-a')).rejects.toThrow(
      'A nomination is already active',
    );
  });

  it('refreshes freshDraft after addAutoPickUser so metadata is not overwritten', async () => {
    const draft = makeDraft();
    (draft as any).metadata = {
      current_nomination: null,
      nomination_deadline: new Date(Date.now() - 5000).toISOString(),
      auction_budgets: { '101': 200, '102': 200 },
      auto_pick_users: [],
    };

    // addAutoPickUser returns a draft with updated auto_pick_users
    const draftAfterAutoAdd = makeDraft();
    (draftAfterAutoAdd as any).metadata = {
      ...draft.metadata,
      auto_pick_users: ['user-a'],
    };

    draftRepo.findById.mockResolvedValue(draft);
    draftRepo.findNextPick.mockResolvedValue({ id: 'pick-1', draftSlot: 1 });
    draftRepo.addAutoPickUser.mockResolvedValue(draftAfterAutoAdd);

    const updatedDraft = makeDraft();
    draftRepo.update.mockResolvedValue(updatedDraft);

    await service.autoNominate('draft-1', 'user-a');

    // The final update's metadata should include auto_pick_users from addAutoPickUser
    const updateCall = draftRepo.update.mock.calls[0];
    const metaSpread = updateCall[1].metadata;
    expect(metaSpread.auto_pick_users).toContain('user-a');
  });
});

describe('AuctionAutoBidService._processAutoBids (auto-resolution & fallback)', () => {
  let autoBidService: AuctionAutoBidService;
  let auctionService: AuctionService;
  let draftRepo: any;
  let draftTimerRepo: any;
  let draftQueueRepo: any;
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
      findNextPick: vi.fn(),
      findBestAvailable: vi.fn(),
      addAutoPickUser: vi.fn(),
      withTransaction: vi.fn(async (fn: any) => {
        const mockClient = { query: vi.fn() };
        return fn(mockClient);
      }),
    };

    draftTimerRepo = {
      upsertAuctionTimer: vi.fn().mockResolvedValue(undefined),
      cancelAuctionTimers: vi.fn().mockResolvedValue(undefined),
    };

    draftQueueRepo = {
      getQueueItemsForPlayerByUsers: vi.fn().mockResolvedValue(new Map()),
      getUserIdsWithMaxBidForPlayer: vi.fn().mockResolvedValue([]),
      findFirstAvailableFromQueue: vi.fn(),
    };

    leagueRepo = {
      findMember: vi.fn().mockResolvedValue({ role: 'member' }),
    };

    playerRepo = {
      findById: vi.fn(),
    };

    autoBidService = new AuctionAutoBidService(draftRepo, draftTimerRepo, draftQueueRepo, leagueRepo, playerRepo);
    auctionService = new AuctionService(draftRepo, draftQueueRepo, leagueRepo, playerRepo, autoBidService);
    autoBidService.setOnDeadlineExpired((draftId, userId) => auctionService.resolveNomination(draftId, userId));
  });

  it('auto-resolves nomination when bid_deadline has expired', async () => {
    const nomination = makeNomination({
      current_bid: 15,
      current_bidder: 'user-b',
      bidder_roster_id: 102,
      bid_deadline: new Date(Date.now() - 5000).toISOString(), // expired
    });
    const draft = makeDraft();
    (draft as any).metadata = {
      current_nomination: nomination,
      auto_pick_users: ['user-a', 'user-b'],
      auction_budgets: { '101': 200, '102': 200 },
    };

    draftRepo.findById.mockResolvedValue(draft);

    const pick = { id: 'pick-1', playerId: 'player-1' };
    draftRepo.makeAuctionPick.mockResolvedValue(pick);

    const afterDeduct = makeDraft();
    (afterDeduct as any).metadata = { auction_budgets: { '101': 200, '102': 185 } };
    draftRepo.deductBudget.mockResolvedValue(afterDeduct);
    draftRepo.completeAndUpdateLeagueInTx.mockResolvedValue(null);
    draftRepo.update.mockResolvedValue(draft);

    const result = await (autoBidService as any)._processAutoBids('draft-1');

    // resolveNomination was triggered — makeAuctionPick should have been called
    expect(draftRepo.makeAuctionPick).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('falls back to nomination player_metadata.auction_value when player has null auctionValue', async () => {
    const nomination = makeNomination({
      current_bid: 1,
      current_bidder: 'user-a',
      bidder_roster_id: 101,
      player_metadata: { full_name: 'Test Player', position: 'QB', auction_value: 30 },
    });

    const draft = new Draft(
      'draft-1', 'league-1', '2025', 'nfl', 'drafting', 'auction',
      null, null,
      { 'user-a': 1, 'user-b': 2 },
      { '1': 101, '2': 102 },
      { ...DEFAULT_DRAFT_SETTINGS, nomination_timer: 30, teams: 12 },
      {
        current_nomination: nomination,
        auto_pick_users: ['user-b'],
        auction_budgets: { '101': 200, '102': 200 },
      },
      'user-a', new Date(), new Date(),
    );

    draftRepo.findById.mockResolvedValue(draft);
    draftRepo.update.mockResolvedValue(draft);

    // Player has null auctionValue and null searchRank
    playerRepo.findById.mockResolvedValue({
      id: 'player-1',
      auctionValue: null,
      searchRank: null,
    });

    await (autoBidService as any)._processAutoBids('draft-1');

    // Auto-bid should have fired (not returned null due to missing auctionValue)
    expect(draftRepo.update).toHaveBeenCalled();
    const updateCall = draftRepo.update.mock.calls[0];
    const nom = updateCall[1].metadata.current_nomination;
    expect(nom.current_bidder).toBe('user-b');
    // With auction_value=30, target = floor(30 * 0.8 * (200/200) * (12/12)) = 24
    // Single auto-bidder vs currentBid=1 → bid = currentBid + 1 = 2
    expect(nom.current_bid).toBe(2);
  });
});

describe('Concurrent bid race (stale-read under lock)', () => {
  let service: AuctionService;
  let draftRepo: any;
  let draftTimerRepo: any;
  let draftQueueRepo: any;
  let leagueRepo: any;
  let capturedClient: any;

  beforeEach(() => {
    capturedClient = { query: vi.fn() };

    draftRepo = {
      findById: vi.fn(),
      update: vi.fn(),
      countPicksWonByRoster: vi.fn().mockResolvedValue(0),
      withTransaction: vi.fn(async (fn: any) => fn(capturedClient)),
    };

    draftTimerRepo = {
      upsertAuctionTimer: vi.fn().mockResolvedValue(undefined),
      cancelAuctionTimers: vi.fn().mockResolvedValue(undefined),
    };

    draftQueueRepo = {};

    leagueRepo = {
      findMember: vi.fn().mockResolvedValue({ role: 'member' }),
    };

    const autoBidService = new AuctionAutoBidService(draftRepo, draftTimerRepo, draftQueueRepo, leagueRepo, {});
    service = new AuctionService(draftRepo, draftQueueRepo, leagueRepo, {}, autoBidService);
  });

  it('second bid fails after re-reading higher bid under lock', async () => {
    const nomination = makeNomination({ current_bid: 5, current_bidder: 'user-a' });
    const staleDraft = makeDraft();
    (staleDraft as any).metadata = {
      current_nomination: nomination,
      auction_budgets: { '101': 200, '102': 200 },
    };

    // After first bid lands: bid is now $10
    const freshNomination = makeNomination({
      current_bid: 10,
      current_bidder: 'user-b',
      bidder_roster_id: 102,
    });
    const freshDraft = makeDraft();
    (freshDraft as any).metadata = {
      current_nomination: freshNomination,
      auction_budgets: { '101': 200, '102': 200 },
    };

    // user-c's pre-check sees stale $5, but lock re-read sees fresh $10
    draftRepo.findById
      .mockResolvedValueOnce(staleDraft)   // pre-check
      .mockResolvedValueOnce(freshDraft);  // inside tx

    await expect(service.placeBid('draft-1', 'user-c', 8)).rejects.toThrow(
      'Bid must be greater than $10',
    );

    expect(capturedClient.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['draft-1'],
    );
  });

  it('bid at exact current amount is rejected (not strictly greater)', async () => {
    const nomination = makeNomination({ current_bid: 15, current_bidder: 'user-a' });
    const draft = makeDraft();
    (draft as any).metadata = {
      current_nomination: nomination,
      auction_budgets: { '101': 200, '102': 200 },
    };

    draftRepo.findById.mockResolvedValue(draft);

    await expect(service.placeBid('draft-1', 'user-b', 15)).rejects.toThrow(
      'Bid must be greater than $15',
    );
  });
});

describe('Auto-bid war continues until lower target exceeded', () => {
  let autoBidService: AuctionAutoBidService;
  let draftRepo: any;
  let draftTimerRepo: any;
  let draftQueueRepo: any;

  beforeEach(() => {
    draftRepo = {
      findById: vi.fn(),
      update: vi.fn(),
      countPicksWonByRoster: vi.fn().mockResolvedValue(0),
      countPicksWonByRosters: vi.fn().mockResolvedValue(new Map()),
      withTransaction: vi.fn(async (fn: any) => {
        const mockClient = { query: vi.fn() };
        return fn(mockClient);
      }),
    };

    draftTimerRepo = {
      upsertAuctionTimer: vi.fn().mockResolvedValue(undefined),
      cancelAuctionTimers: vi.fn().mockResolvedValue(undefined),
    };

    draftQueueRepo = {
      getQueueItemsForPlayerByUsers: vi.fn().mockResolvedValue(new Map()),
      getUserIdsWithMaxBidForPlayer: vi.fn().mockResolvedValue([]),
    };

    autoBidService = new AuctionAutoBidService(draftRepo, draftTimerRepo, draftQueueRepo, { findMember: vi.fn() } as any, {
      findById: vi.fn().mockResolvedValue({ id: 'player-1', auctionValue: 40, searchRank: 5 }),
    } as any);
  });

  it('war stops at lower_target + 1 with two different max_bids', async () => {
    // user-a: max_bid=10, user-b: max_bid=25. Starting at $1, user-a is current bidder.
    let currentBid = 1;
    let currentBidder = 'user-a';

    draftQueueRepo.getQueueItemsForPlayerByUsers.mockImplementation(() =>
      new Map([['user-a', { max_bid: 10 }], ['user-b', { max_bid: 25 }]]),
    );

    draftRepo.findById.mockImplementation(() => {
      const nomination = makeNomination({
        current_bid: currentBid,
        current_bidder: currentBidder,
        bidder_roster_id: currentBidder === 'user-a' ? 101 : 102,
      });
      return new Draft(
        'draft-1', 'league-1', '2025', 'nfl', 'drafting', 'auction',
        null, null,
        { 'user-a': 1, 'user-b': 2 },
        { '1': 101, '2': 102 },
        { ...DEFAULT_DRAFT_SETTINGS, nomination_timer: 30, teams: 12 },
        {
          current_nomination: nomination,
          auto_pick_users: ['user-a', 'user-b'],
          auction_budgets: { '101': 200, '102': 200 },
        },
        'user-a', new Date(), new Date(),
      );
    });

    draftRepo.update.mockImplementation((_id: string, data: any) => {
      const nom = data.metadata.current_nomination;
      currentBid = nom.current_bid;
      currentBidder = nom.current_bidder;
      return draftRepo.findById();
    });

    // Drive the bidding war
    const bids: Array<{ bidder: string; amount: number }> = [];
    for (let i = 0; i < 50; i++) {
      const result = await (autoBidService as any)._processAutoBids('draft-1');
      if (!result) break;
      bids.push({ bidder: currentBidder, amount: currentBid });
    }

    expect(bids.length).toBeLessThan(50);
    expect(bids.length).toBeGreaterThan(0);

    // user-b wins at $10 (user-a's effective target is 10, can't counter when currentBid=10)
    const lastBid = bids[bids.length - 1];
    expect(lastBid.bidder).toBe('user-b');
    expect(lastBid.amount).toBe(10);

    // Bids strictly alternate
    for (let i = 1; i < bids.length; i++) {
      expect(bids[i].bidder).not.toBe(bids[i - 1].bidder);
    }
  });

  it('equal targets: war terminates without infinite loop', async () => {
    let currentBid = 1;
    let currentBidder = 'user-a';

    draftQueueRepo.getQueueItemsForPlayerByUsers.mockImplementation(() =>
      new Map([['user-a', { max_bid: 10 }], ['user-b', { max_bid: 10 }]]),
    );

    draftRepo.findById.mockImplementation(() => {
      const nomination = makeNomination({
        current_bid: currentBid,
        current_bidder: currentBidder,
        bidder_roster_id: currentBidder === 'user-a' ? 101 : 102,
      });
      return new Draft(
        'draft-1', 'league-1', '2025', 'nfl', 'drafting', 'auction',
        null, null,
        { 'user-a': 1, 'user-b': 2 },
        { '1': 101, '2': 102 },
        { ...DEFAULT_DRAFT_SETTINGS, nomination_timer: 30, teams: 12 },
        {
          current_nomination: nomination,
          auto_pick_users: ['user-a', 'user-b'],
          auction_budgets: { '101': 200, '102': 200 },
        },
        'user-a', new Date(), new Date(),
      );
    });

    draftRepo.update.mockImplementation((_id: string, data: any) => {
      const nom = data.metadata.current_nomination;
      currentBid = nom.current_bid;
      currentBidder = nom.current_bidder;
      return draftRepo.findById();
    });

    const bids: Array<{ bidder: string; amount: number }> = [];
    for (let i = 0; i < 50; i++) {
      const result = await (autoBidService as any)._processAutoBids('draft-1');
      if (!result) break;
      bids.push({ bidder: currentBidder, amount: currentBid });
    }

    expect(bids.length).toBeLessThan(50);
    expect(bids.length).toBeGreaterThan(0);

    // Last bid should be at or below the shared target of 10
    const lastBid = bids[bids.length - 1];
    expect(lastBid.amount).toBeLessThanOrEqual(10);
  });
});

describe('Recovery: auto-resolves expired nomination after restart', () => {
  let autoBidService: AuctionAutoBidService;
  let draftRepo: any;
  let draftTimerRepo: any;
  let draftQueueRepo: any;
  let capturedClient: any;

  beforeEach(() => {
    capturedClient = { query: vi.fn() };

    draftRepo = {
      findById: vi.fn(),
      update: vi.fn(),
      makeAuctionPick: vi.fn(),
      deductBudget: vi.fn(),
      completeAndUpdateLeagueInTx: vi.fn().mockResolvedValue(null),
      countPicksWonByRoster: vi.fn().mockResolvedValue(0),
      countPicksWonByRosters: vi.fn().mockResolvedValue(new Map()),
      findNextPick: vi.fn(),
      findBestAvailable: vi.fn(),
      addAutoPickUser: vi.fn().mockResolvedValue(null),
      withTransaction: vi.fn(async (fn: any) => fn(capturedClient)),
    };

    draftTimerRepo = {
      upsertAuctionTimer: vi.fn().mockResolvedValue(undefined),
      cancelAuctionTimers: vi.fn().mockResolvedValue(undefined),
    };

    draftQueueRepo = {
      getQueueItemsForPlayerByUsers: vi.fn().mockResolvedValue(new Map()),
      getUserIdsWithMaxBidForPlayer: vi.fn().mockResolvedValue([]),
      findFirstAvailableFromQueue: vi.fn().mockResolvedValue(null),
    };

    const leagueRepo = { findMember: vi.fn().mockResolvedValue({ role: 'member' }) };
    const playerRepo = { findById: vi.fn().mockResolvedValue({ id: 'player-1', auctionValue: 40 }) };

    autoBidService = new AuctionAutoBidService(draftRepo, draftTimerRepo, draftQueueRepo, leagueRepo as any, playerRepo as any);
    const auctionService = new AuctionService(draftRepo, draftQueueRepo, leagueRepo as any, playerRepo as any, autoBidService);
    autoBidService.setOnDeadlineExpired((draftId, userId) => auctionService.resolveNomination(draftId, userId));
  });

  it('resolves expired nomination via processAutoBidsFromTimer', async () => {
    const expiredNomination = makeNomination({
      current_bid: 20,
      current_bidder: 'user-b',
      bidder_roster_id: 102,
      bid_deadline: new Date(Date.now() - 10_000).toISOString(),
    });

    const draft = makeDraft();
    (draft as any).metadata = {
      current_nomination: expiredNomination,
      auto_pick_users: ['user-a'],
      auction_budgets: { '101': 200, '102': 200 },
    };

    draftRepo.findById.mockResolvedValue(draft);
    draftRepo.makeAuctionPick.mockResolvedValue({ id: 'pick-1', playerId: 'player-1' });

    const afterDeduct = makeDraft();
    (afterDeduct as any).metadata = { auction_budgets: { '101': 200, '102': 180 } };
    draftRepo.deductBudget.mockResolvedValue(afterDeduct);
    draftRepo.update.mockResolvedValue(draft);

    await autoBidService.processAutoBidsFromTimer('draft-1');

    // Should have resolved the expired nomination
    expect(draftRepo.makeAuctionPick).toHaveBeenCalled();
    const pickCall = draftRepo.makeAuctionPick.mock.calls[0];
    expect(pickCall[2]).toBe('user-b');     // winner
    expect(pickCall[3]).toBe(102);          // roster_id
    expect(pickCall[4]).toBe(20);           // winning bid amount
  });

  it('deducts budget from winner on recovery resolution', async () => {
    const expiredNomination = makeNomination({
      current_bid: 30,
      current_bidder: 'user-b',
      bidder_roster_id: 102,
      bid_deadline: new Date(Date.now() - 3_000).toISOString(),
    });

    const draft = makeDraft();
    (draft as any).metadata = {
      current_nomination: expiredNomination,
      auction_budgets: { '101': 200, '102': 200 },
    };

    draftRepo.findById.mockResolvedValue(draft);
    draftRepo.makeAuctionPick.mockResolvedValue({ id: 'pick-1' });

    const afterDeduct = makeDraft();
    (afterDeduct as any).metadata = { auction_budgets: { '101': 200, '102': 170 } };
    draftRepo.deductBudget.mockResolvedValue(afterDeduct);
    draftRepo.update.mockResolvedValue(draft);

    await autoBidService.processAutoBidsFromTimer('draft-1');

    expect(draftRepo.deductBudget).toHaveBeenCalled();
    const deductCall = draftRepo.deductBudget.mock.calls[0];
    expect(deductCall[1]).toBe(102);  // roster_id
    expect(deductCall[2]).toBe(30);   // amount
  });

  it('schedules deadline follow-up when no auto-bid and nomination still active', async () => {
    const nomination = makeNomination({
      current_bid: 5,
      current_bidder: 'user-a',
      bidder_roster_id: 101,
      bid_deadline: new Date(Date.now() + 20_000).toISOString(),
    });

    const draft = makeDraft();
    (draft as any).metadata = {
      current_nomination: nomination,
      auto_pick_users: [],
      auction_budgets: { '101': 200, '102': 200 },
    };

    draftRepo.findById.mockResolvedValue(draft);

    await autoBidService.processAutoBidsFromTimer('draft-1');

    // No auto-bid placed, no resolution — should schedule a deadline follow-up
    expect(draftRepo.makeAuctionPick).not.toHaveBeenCalled();
    expect(draftTimerRepo.upsertAuctionTimer).toHaveBeenCalled();

    const timerCall = draftTimerRepo.upsertAuctionTimer.mock.calls[0];
    expect(timerCall[0]).toBe('draft-1');
    expect(timerCall[1]).toBe('deadline');
    // run_at should be roughly at bid_deadline + 1s
    const runAt = new Date(timerCall[2]).getTime();
    expect(runAt).toBeGreaterThan(Date.now() + 15_000);
  });
});
