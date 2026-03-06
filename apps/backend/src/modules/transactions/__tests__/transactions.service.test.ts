import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransactionService } from '../transactions.service';
import { WaiverClaim } from '../transactions.model';
import { ValidationException } from '../../../shared/exceptions';

function makeClaim(overrides: Partial<WaiverClaim> = {}): WaiverClaim {
  return new WaiverClaim(
    overrides.id ?? 'claim-1',
    overrides.leagueId ?? 'league-1',
    overrides.rosterId ?? 101,
    overrides.userId ?? 'user-a',
    overrides.playerId ?? 'player-1',
    overrides.dropPlayerId ?? null,
    overrides.faabAmount ?? 0,
    overrides.priority ?? 1,
    overrides.status ?? 'pending',
    overrides.processAt ?? new Date(),
    null,
    null,
    {},
    new Date(),
    new Date(),
  );
}

describe('TransactionService.processLeagueWaivers', () => {
  let service: TransactionService;
  let txRepo: any;
  let leagueRepo: any;
  let leagueRostersRepo: any;
  let capturedClient: any;

  beforeEach(() => {
    capturedClient = null;

    txRepo = {
      withTransaction: vi.fn(async (fn: any) => {
        capturedClient = { query: vi.fn() };
        return fn(capturedClient);
      }),
      findPendingClaimsByLeague: vi.fn().mockResolvedValue([]),
      updateClaimStatus: vi.fn(),
      addPlayerToRoster: vi.fn().mockResolvedValue(true),
      removePlayerFromRoster: vi.fn(),
      createPlayerWaiver: vi.fn(),
      createTransaction: vi.fn().mockResolvedValue({ id: 'tx-1', toSafeObject: () => ({}) }),
      rotateWaiverPriority: vi.fn(),
      deductFaab: vi.fn().mockResolvedValue(true),
      refundFaab: vi.fn(),
      cleanExpiredWaivers: vi.fn(),
    };

    leagueRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'league-1',
        settings: { waiver_type: 1, waiver_clear_days: 2 },
        rosterPositions: Array(15).fill('BN'),
      }),
    };

    leagueRostersRepo = {
      findRosterByOwner: vi.fn().mockResolvedValue({
        rosterId: 101,
        players: [],
        settings: { waiver_position: 1 },
      }),
      findRosterByOwnerForUpdate: vi.fn().mockResolvedValue({
        rosterId: 101,
        players: [],
        settings: { waiver_position: 1 },
      }),
    };

    service = new TransactionService(txRepo, leagueRepo, {} as any, leagueRostersRepo);
  });

  it('passes client to leagueRepo.findById within transaction', async () => {
    await service.processLeagueWaivers('league-1');

    // leagueRepo.findById should be called with (leagueId, client)
    expect(leagueRepo.findById).toHaveBeenCalledWith('league-1', capturedClient);
  });

  it('uses findRosterByOwnerForUpdate (row lock) within transaction', async () => {
    const claim = makeClaim();
    txRepo.findPendingClaimsByLeague.mockResolvedValue([claim]);

    await service.processLeagueWaivers('league-1');

    // findRosterByOwnerForUpdate should receive the transaction client
    expect(leagueRostersRepo.findRosterByOwnerForUpdate).toHaveBeenCalledWith('league-1', 'user-a', capturedClient);
  });

  it('acquires advisory lock before processing', async () => {
    await service.processLeagueWaivers('league-1');

    expect(capturedClient.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['league-1'],
    );
  });

  it('treats duplicate addPlayerToRoster as invalid claim', async () => {
    const claim = makeClaim();
    txRepo.findPendingClaimsByLeague.mockResolvedValue([claim]);
    txRepo.addPlayerToRoster.mockResolvedValue(false); // player already on roster

    await service.processLeagueWaivers('league-1');

    expect(txRepo.updateClaimStatus).toHaveBeenCalledWith(
      capturedClient,
      'claim-1',
      'invalid',
    );
    // No transaction should be created for a failed add
    expect(txRepo.createTransaction).not.toHaveBeenCalled();
  });

  it('successfully processes a valid claim within the transaction', async () => {
    const claim = makeClaim({ dropPlayerId: 'player-drop' });
    txRepo.findPendingClaimsByLeague.mockResolvedValue([claim]);
    txRepo.removePlayerFromRoster.mockResolvedValue(true);
    leagueRostersRepo.findRosterByOwnerForUpdate.mockResolvedValue({
      rosterId: 101,
      players: ['player-drop'],
      settings: { waiver_position: 1 },
    });

    await service.processLeagueWaivers('league-1');

    expect(txRepo.addPlayerToRoster).toHaveBeenCalledWith(
      capturedClient, 'league-1', 'user-a', 'player-1',
    );
    expect(txRepo.removePlayerFromRoster).toHaveBeenCalledWith(
      capturedClient, 'league-1', 'user-a', 'player-drop',
    );
    expect(txRepo.createTransaction).toHaveBeenCalled();
    expect(txRepo.updateClaimStatus).toHaveBeenCalledWith(
      capturedClient, 'claim-1', 'successful', 'tx-1',
    );
  });

  it('does not deduct FAAB when addPlayerToRoster returns false', async () => {
    leagueRepo.findById.mockResolvedValue({
      id: 'league-1',
      settings: { waiver_type: 2, waiver_clear_days: 2 },
      rosterPositions: Array(15).fill('BN'),
    });
    const claim = makeClaim({ faabAmount: 10 });
    txRepo.findPendingClaimsByLeague.mockResolvedValue([claim]);
    txRepo.addPlayerToRoster.mockResolvedValue(false);

    await service.processLeagueWaivers('league-1');

    expect(txRepo.deductFaab).not.toHaveBeenCalled();
    expect(txRepo.updateClaimStatus).toHaveBeenCalledWith(
      capturedClient, 'claim-1', 'invalid',
    );
  });

  it('rolls back roster add when FAAB deduction fails', async () => {
    leagueRepo.findById.mockResolvedValue({
      id: 'league-1',
      settings: { waiver_type: 2, waiver_clear_days: 2 },
      rosterPositions: Array(15).fill('BN'),
    });
    const claim = makeClaim({ faabAmount: 50 });
    txRepo.findPendingClaimsByLeague.mockResolvedValue([claim]);
    txRepo.addPlayerToRoster.mockResolvedValue(true);
    txRepo.deductFaab.mockResolvedValue(false);

    await service.processLeagueWaivers('league-1');

    expect(txRepo.removePlayerFromRoster).toHaveBeenCalledWith(
      capturedClient, 'league-1', 'user-a', 'player-1',
    );
    expect(txRepo.updateClaimStatus).toHaveBeenCalledWith(
      capturedClient, 'claim-1', 'failed',
    );
    expect(txRepo.createTransaction).not.toHaveBeenCalled();
  });

  it('marks claim invalid when roster is full and no drop player is provided', async () => {
    // Roster has 15 players = full (matches rosterPositions.length)
    leagueRostersRepo.findRosterByOwnerForUpdate.mockResolvedValue({
      rosterId: 101,
      players: Array(15).fill('existing-player'),
      settings: { waiver_position: 1 },
    });
    const claim = makeClaim({ dropPlayerId: null });
    txRepo.findPendingClaimsByLeague.mockResolvedValue([claim]);

    await service.processLeagueWaivers('league-1');

    expect(txRepo.updateClaimStatus).toHaveBeenCalledWith(
      capturedClient, 'claim-1', 'invalid',
    );
    expect(txRepo.addPlayerToRoster).not.toHaveBeenCalled();
    expect(txRepo.createTransaction).not.toHaveBeenCalled();
  });

  it('marks claim invalid when drop player is no longer on the locked roster', async () => {
    // Roster does not contain the drop player
    leagueRostersRepo.findRosterByOwnerForUpdate.mockResolvedValue({
      rosterId: 101,
      players: ['some-other-player'],
      settings: { waiver_position: 1 },
    });
    const claim = makeClaim({ dropPlayerId: 'player-gone' });
    txRepo.findPendingClaimsByLeague.mockResolvedValue([claim]);

    await service.processLeagueWaivers('league-1');

    expect(txRepo.updateClaimStatus).toHaveBeenCalledWith(
      capturedClient, 'claim-1', 'invalid',
    );
    expect(txRepo.addPlayerToRoster).not.toHaveBeenCalled();
    expect(txRepo.createTransaction).not.toHaveBeenCalled();
  });

  it('refunds FAAB and removes added player if post-add drop removal fails', async () => {
    leagueRepo.findById.mockResolvedValue({
      id: 'league-1',
      settings: { waiver_type: 2, waiver_clear_days: 2 },
      rosterPositions: Array(15).fill('BN'),
    });
    leagueRostersRepo.findRosterByOwnerForUpdate.mockResolvedValue({
      rosterId: 101,
      players: ['player-drop'],
      settings: { waiver_position: 1 },
    });
    const claim = makeClaim({ dropPlayerId: 'player-drop', faabAmount: 25 });
    txRepo.findPendingClaimsByLeague.mockResolvedValue([claim]);
    txRepo.addPlayerToRoster.mockResolvedValue(true);
    txRepo.deductFaab.mockResolvedValue(true);
    // Drop removal unexpectedly fails
    txRepo.removePlayerFromRoster.mockResolvedValue(false);

    await service.processLeagueWaivers('league-1');

    // Should undo the added player (second call to removePlayerFromRoster)
    expect(txRepo.removePlayerFromRoster).toHaveBeenCalledWith(
      capturedClient, 'league-1', 'user-a', 'player-drop',
    );
    expect(txRepo.removePlayerFromRoster).toHaveBeenCalledWith(
      capturedClient, 'league-1', 'user-a', 'player-1',
    );
    // Should refund FAAB
    expect(txRepo.refundFaab).toHaveBeenCalledWith(
      capturedClient, 'league-1', 'user-a', 25,
    );
    // Claim marked invalid, no transaction created
    expect(txRepo.updateClaimStatus).toHaveBeenCalledWith(
      capturedClient, 'claim-1', 'invalid',
    );
    expect(txRepo.createTransaction).not.toHaveBeenCalled();
  });

  it('does not overwrite invalid claim status to outbid in the final loop', async () => {
    // claim-1 higher priority but roster not found → invalid
    // claim-2 lower priority → wins
    const claim1 = makeClaim({ id: 'claim-1', userId: 'user-a', rosterId: 101, priority: 1 });
    const claim2 = makeClaim({ id: 'claim-2', userId: 'user-b', rosterId: 102, priority: 2 });
    txRepo.findPendingClaimsByLeague.mockResolvedValue([claim1, claim2]);

    // claim-1's roster not found (returns null), claim-2's roster found
    leagueRostersRepo.findRosterByOwnerForUpdate
      .mockResolvedValueOnce(null) // user-a → no roster
      .mockResolvedValueOnce({ rosterId: 102, players: [], settings: { waiver_position: 2 } });

    await service.processLeagueWaivers('league-1');

    // claim-1 should be marked invalid (not outbid)
    const statusCalls = txRepo.updateClaimStatus.mock.calls;
    const claim1Calls = statusCalls.filter((c: any) => c[1] === 'claim-1');
    expect(claim1Calls).toHaveLength(1);
    expect(claim1Calls[0][2]).toBe('invalid');

    // claim-2 should be marked successful
    const claim2Calls = statusCalls.filter((c: any) => c[1] === 'claim-2');
    expect(claim2Calls).toHaveLength(1);
    expect(claim2Calls[0][2]).toBe('successful');
  });
});

describe('TransactionService.addFreeAgent', () => {
  let service: TransactionService;
  let txRepo: any;
  let leagueRepo: any;
  let leagueRostersRepo: any;
  let leagueMembersRepo: any;

  beforeEach(() => {
    txRepo = {
      withTransaction: vi.fn(async (fn: any) => {
        const client = { query: vi.fn() };
        return fn(client);
      }),
      isPlayerRosteredInLeague: vi.fn().mockResolvedValue(false),
      isPlayerOnWaivers: vi.fn().mockResolvedValue(false),
      addPlayerToRoster: vi.fn().mockResolvedValue(true),
      removePlayerFromRoster: vi.fn().mockResolvedValue(true),
      createPlayerWaiver: vi.fn(),
      createTransaction: vi.fn().mockResolvedValue({ id: 'tx-1', toSafeObject: () => ({}) }),
    };

    leagueRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'league-1',
        status: 'active',
        settings: { disable_adds: false, waiver_clear_days: 2 },
        rosterPositions: Array(15).fill('BN'),
      }),
    };

    leagueRostersRepo = {
      findRosterByOwner: vi.fn().mockResolvedValue({
        rosterId: 101,
        players: ['p1', 'p2'],
        settings: {},
      }),
      findRosterByOwnerForUpdate: vi.fn().mockResolvedValue({
        rosterId: 101,
        players: ['p1', 'p2'],
        settings: {},
      }),
    };

    leagueMembersRepo = {
      findMember: vi.fn().mockResolvedValue({ userId: 'user-a', username: 'Alice' }),
    };

    service = new TransactionService(txRepo, leagueRepo, leagueMembersRepo, leagueRostersRepo);
  });

  it('throws when locked roster is full (race condition: filled between pre-check and lock)', async () => {
    // Pre-transaction: roster has space (2 players, 15 slots)
    leagueRostersRepo.findRosterByOwner.mockResolvedValue({
      rosterId: 101,
      players: ['p1', 'p2'],
      settings: {},
    });

    // Under lock: roster is now full (15 players — another concurrent add filled it)
    leagueRostersRepo.findRosterByOwnerForUpdate.mockResolvedValue({
      rosterId: 101,
      players: Array(15).fill('existing'),
      settings: {},
    });

    await expect(
      service.addFreeAgent('league-1', 'user-a', 'new-player'),
    ).rejects.toThrow(ValidationException);

    await expect(
      service.addFreeAgent('league-1', 'user-a', 'new-player'),
    ).rejects.toThrow('Roster is full');

    // Should never attempt the actual add
    expect(txRepo.addPlayerToRoster).not.toHaveBeenCalled();
  });

  it('throws when drop player disappears between pre-check and lock', async () => {
    // Pre-transaction: drop player is on roster
    leagueRostersRepo.findRosterByOwner.mockResolvedValue({
      rosterId: 101,
      players: ['drop-me', 'p2'],
      settings: {},
    });

    // Under lock: drop player is gone (concurrent drop removed it)
    leagueRostersRepo.findRosterByOwnerForUpdate.mockResolvedValue({
      rosterId: 101,
      players: ['p2'],
      settings: {},
    });

    await expect(
      service.addFreeAgent('league-1', 'user-a', 'new-player', 'drop-me'),
    ).rejects.toThrow(ValidationException);

    await expect(
      service.addFreeAgent('league-1', 'user-a', 'new-player', 'drop-me'),
    ).rejects.toThrow('Drop player is not on your roster');

    expect(txRepo.addPlayerToRoster).not.toHaveBeenCalled();
  });
});

describe('TransactionService.updateWaiverClaim', () => {
  let service: TransactionService;
  let txRepo: any;
  let leagueRepo: any;
  let leagueRostersRepo: any;
  let leagueMembersRepo: any;

  beforeEach(() => {
    txRepo = {
      findWaiverClaimById: vi.fn(),
      updateClaim: vi.fn(),
      withTransaction: vi.fn(),
    };

    leagueRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'league-1',
        settings: { waiver_type: 2, waiver_bid_min: 1 },
        rosterPositions: Array(15).fill('BN'),
      }),
    };

    leagueRostersRepo = {
      findRosterByOwner: vi.fn().mockResolvedValue({
        rosterId: 101,
        players: ['p1', 'p2', 'p3'],
        settings: { waiver_position: 1 },
      }),
    };

    leagueMembersRepo = {
      findMember: vi.fn().mockResolvedValue({ userId: 'user-a', username: 'Alice' }),
    };

    service = new TransactionService(txRepo, leagueRepo, leagueMembersRepo, leagueRostersRepo);
  });

  it('rejects update when roster is full and no drop player specified', async () => {
    const claim = makeClaim({ dropPlayerId: 'p1' });
    txRepo.findWaiverClaimById.mockResolvedValue(claim);

    // Roster is full (15/15)
    leagueRostersRepo.findRosterByOwner.mockResolvedValue({
      rosterId: 101,
      players: Array(15).fill('existing'),
      settings: { waiver_position: 1 },
    });

    await expect(
      service.updateWaiverClaim('league-1', 'claim-1', 'user-a', { drop_player_id: null }),
    ).rejects.toThrow(ValidationException);

    await expect(
      service.updateWaiverClaim('league-1', 'claim-1', 'user-a', { drop_player_id: null }),
    ).rejects.toThrow('Roster is full');

    expect(txRepo.updateClaim).not.toHaveBeenCalled();
  });

  it('rejects update when drop player is not on current roster', async () => {
    const claim = makeClaim();
    txRepo.findWaiverClaimById.mockResolvedValue(claim);

    await expect(
      service.updateWaiverClaim('league-1', 'claim-1', 'user-a', { drop_player_id: 'not-on-roster' }),
    ).rejects.toThrow(ValidationException);

    await expect(
      service.updateWaiverClaim('league-1', 'claim-1', 'user-a', { drop_player_id: 'not-on-roster' }),
    ).rejects.toThrow('Drop player is not on your roster');

    expect(txRepo.updateClaim).not.toHaveBeenCalled();
  });

  it('rejects update when FAAB bid is below minimum', async () => {
    const claim = makeClaim({ faabAmount: 5 });
    txRepo.findWaiverClaimById.mockResolvedValue(claim);

    // waiver_bid_min is 1, so 0 should fail
    await expect(
      service.updateWaiverClaim('league-1', 'claim-1', 'user-a', { faab_amount: 0 }),
    ).rejects.toThrow(ValidationException);

    await expect(
      service.updateWaiverClaim('league-1', 'claim-1', 'user-a', { faab_amount: 0 }),
    ).rejects.toThrow('Minimum FAAB bid');

    expect(txRepo.updateClaim).not.toHaveBeenCalled();
  });

  it('rejects update on non-pending claim', async () => {
    const claim = makeClaim({ status: 'successful' });
    txRepo.findWaiverClaimById.mockResolvedValue(claim);

    await expect(
      service.updateWaiverClaim('league-1', 'claim-1', 'user-a', { faab_amount: 10 }),
    ).rejects.toThrow(ValidationException);

    await expect(
      service.updateWaiverClaim('league-1', 'claim-1', 'user-a', { faab_amount: 10 }),
    ).rejects.toThrow('Only pending claims can be updated');

    expect(txRepo.updateClaim).not.toHaveBeenCalled();
  });

  it('allows valid update with correct values', async () => {
    const claim = makeClaim({ faabAmount: 5, dropPlayerId: null });
    txRepo.findWaiverClaimById.mockResolvedValue(claim);

    const updatedClaim = makeClaim({ faabAmount: 10, dropPlayerId: 'p2' });
    txRepo.updateClaim.mockResolvedValue(updatedClaim);

    const result = await service.updateWaiverClaim('league-1', 'claim-1', 'user-a', {
      faab_amount: 10,
      drop_player_id: 'p2',
    });

    expect(txRepo.updateClaim).toHaveBeenCalledWith('claim-1', {
      dropPlayerId: 'p2',
      faabAmount: 10,
    });
    expect(result.faabAmount).toBe(10);
  });
});
