import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DraftService } from '../drafts.service';
import { Draft, DraftPick, DEFAULT_DRAFT_SETTINGS } from '../drafts.model';

function makeDraft(): Draft {
  return new Draft(
    'draft-1',
    'league-1',
    '2025',
    'nfl',
    'drafting',
    'snake',
    null,
    null,
    { 'user-a': 1, 'user-b': 2 },
    { '1': 101, '2': 102 },
    { ...DEFAULT_DRAFT_SETTINGS, teams: 2 },
    {},
    'user-a',
    new Date(),
    new Date(),
  );
}

function makePick(overrides: Partial<DraftPick> = {}): DraftPick {
  return new DraftPick(
    overrides.id ?? 'pick-1',
    overrides.draftId ?? 'draft-1',
    overrides.playerId ?? null,
    overrides.pickedBy ?? null,
    overrides.rosterId ?? 101,
    overrides.round ?? 1,
    overrides.pickNo ?? 1,
    overrides.draftSlot ?? 1,
    false,
    null,
    {},
    null,
    new Date(),
  );
}

describe('DraftService.makePick idempotency', () => {
  let service: DraftService;
  let draftRepo: any;
  let leagueRepo: any;
  let playerRepo: any;

  beforeEach(() => {
    draftRepo = {
      findById: vi.fn(),
      findNextPick: vi.fn(),
      isPlayerPicked: vi.fn().mockResolvedValue(false),
      makePick: vi.fn(),
      findPickById: vi.fn(),
      update: vi.fn(),
      completeAndUpdateLeague: vi.fn().mockResolvedValue(null),
    };

    leagueRepo = {
      findMember: vi.fn().mockResolvedValue({ role: 'member' }),
    };

    playerRepo = {
      findById: vi.fn().mockResolvedValue({
        firstName: 'Test',
        lastName: 'Player',
        fullName: 'Test Player',
        position: 'QB',
        team: 'NYG',
      }),
    };

    service = new DraftService(draftRepo, leagueRepo, playerRepo);
  });

  it('returns idempotent success when makePick returns null and existing pick has same playerId', async () => {
    const draft = makeDraft();
    const nextPick = makePick({ id: 'pick-1', rosterId: 101 });

    draftRepo.findById.mockResolvedValue(draft);
    draftRepo.findNextPick.mockResolvedValue(nextPick);
    draftRepo.makePick.mockResolvedValue(null); // CAS failed
    draftRepo.findPickById.mockResolvedValue(
      makePick({ id: 'pick-1', playerId: 'player-x', pickedBy: 'user-a' }),
    );

    const result = await service.makePick('draft-1', 'user-a', 'player-x');

    expect(result.pick.playerId).toBe('player-x');
    expect(result.chainedPicks).toEqual([]);
    // Should not attempt to update timestamp or complete draft
    expect(draftRepo.update).not.toHaveBeenCalled();
    expect(draftRepo.completeAndUpdateLeague).not.toHaveBeenCalled();
  });

  it('throws ConflictException when makePick returns null and existing pick has different playerId', async () => {
    const draft = makeDraft();
    const nextPick = makePick({ id: 'pick-1', rosterId: 101 });

    draftRepo.findById.mockResolvedValue(draft);
    draftRepo.findNextPick.mockResolvedValue(nextPick);
    draftRepo.makePick.mockResolvedValue(null); // CAS failed
    draftRepo.findPickById.mockResolvedValue(
      makePick({ id: 'pick-1', playerId: 'different-player', pickedBy: 'user-b' }),
    );

    await expect(service.makePick('draft-1', 'user-a', 'player-x')).rejects.toThrow(
      'Pick was already made',
    );
  });
});
