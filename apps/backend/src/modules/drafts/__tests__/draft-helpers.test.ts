import { describe, it, expect } from 'vitest';
import {
  findUserBySlot,
  findRosterIdByUserId,
  findUserByRosterId,
  getMaxPlayersPerTeam,
  assertBudgetExists,
} from '../draft-helpers';
import { Draft, DEFAULT_DRAFT_SETTINGS, DraftSettings } from '../drafts.model';

interface MakeDraftOverrides {
  draftOrder?: Record<string, number>;
  slotToRosterId?: Record<string, number>;
  settings?: DraftSettings;
}

function makeDraft(overrides: MakeDraftOverrides = {}): Draft {
  return new Draft(
    'draft-1',
    'league-1',
    '2025',
    'nfl',
    'pre_draft',
    'snake',
    null,
    null,
    overrides.draftOrder ?? { 'user-a': 1, 'user-b': 2, 'user-c': 3 },
    overrides.slotToRosterId ?? { '1': 101, '2': 102, '3': 103 },
    overrides.settings ?? { ...DEFAULT_DRAFT_SETTINGS },
    {},
    'user-a',
    new Date(),
    new Date(),
  );
}

describe('findUserBySlot', () => {
  const draftOrder = { 'user-a': 1, 'user-b': 2, 'user-c': 3 };

  it('returns correct userId for a known slot', () => {
    expect(findUserBySlot(draftOrder, 2)).toBe('user-b');
  });

  it('returns null for an unknown slot', () => {
    expect(findUserBySlot(draftOrder, 99)).toBeNull();
  });
});

describe('findRosterIdByUserId', () => {
  it('returns correct rosterId for a known user', () => {
    const draft = makeDraft();
    expect(findRosterIdByUserId(draft, 'user-b')).toBe(102);
  });

  it('returns null for an unknown user', () => {
    const draft = makeDraft();
    expect(findRosterIdByUserId(draft, 'user-unknown')).toBeNull();
  });
});

describe('findUserByRosterId', () => {
  const draftOrder = { 'user-a': 1, 'user-b': 2, 'user-c': 3 };
  const slotToRosterId = { '1': 101, '2': 102, '3': 103 };

  it('returns correct userId for a known rosterId', () => {
    expect(findUserByRosterId(draftOrder, slotToRosterId, 103)).toBe('user-c');
  });

  it('returns null for an unknown rosterId', () => {
    expect(findUserByRosterId(draftOrder, slotToRosterId, 999)).toBeNull();
  });
});

describe('getMaxPlayersPerTeam', () => {
  it('returns max_players_per_team when set', () => {
    const draft = makeDraft({
      settings: { ...DEFAULT_DRAFT_SETTINGS, max_players_per_team: 20 },
    });
    expect(getMaxPlayersPerTeam(draft)).toBe(20);
  });

  it('falls back to rounds when max_players_per_team is 0', () => {
    const draft = makeDraft({
      settings: { ...DEFAULT_DRAFT_SETTINGS, max_players_per_team: 0, rounds: 15 },
    });
    expect(getMaxPlayersPerTeam(draft)).toBe(15);
  });
});

describe('assertBudgetExists', () => {
  it('does not throw when roster has a budget entry', () => {
    expect(() => assertBudgetExists({ '101': 200 }, 101, 'test')).not.toThrow();
  });

  it('does not throw when budget is zero (legitimate)', () => {
    expect(() => assertBudgetExists({ '101': 0 }, 101, 'test')).not.toThrow();
  });

  it('throws when budgets is undefined', () => {
    expect(() => assertBudgetExists(undefined, 101, 'test')).toThrow(
      'Budget entry missing for roster 101',
    );
  });

  it('throws when roster key is missing from budgets', () => {
    expect(() => assertBudgetExists({ '102': 200 }, 101, 'bid placement')).toThrow(
      'Budget entry missing for roster 101 during bid placement',
    );
  });
});
