import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransactionService } from '../transactions.service';
import { WaiverClaim } from '../transactions.model';

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
      cleanExpiredWaivers: vi.fn(),
    };

    leagueRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'league-1',
        settings: { waiver_type: 1, waiver_clear_days: 2 },
        rosterPositions: Array(15).fill('BN'),
      }),
      findRosterByOwner: vi.fn().mockResolvedValue({
        rosterId: 101,
        players: [],
        settings: { waiver_position: 1 },
      }),
    };

    service = new TransactionService(txRepo, leagueRepo);
  });

  it('passes client to leagueRepo.findById within transaction', async () => {
    await service.processLeagueWaivers('league-1');

    // leagueRepo.findById should be called with (leagueId, client)
    expect(leagueRepo.findById).toHaveBeenCalledWith('league-1', capturedClient);
  });

  it('passes client to leagueRepo.findRosterByOwner within transaction', async () => {
    const claim = makeClaim();
    txRepo.findPendingClaimsByLeague.mockResolvedValue([claim]);

    await service.processLeagueWaivers('league-1');

    // findRosterByOwner should receive the transaction client
    expect(leagueRepo.findRosterByOwner).toHaveBeenCalledWith('league-1', 'user-a', capturedClient);
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
});
