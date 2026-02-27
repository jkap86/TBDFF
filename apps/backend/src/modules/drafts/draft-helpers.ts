import { Draft } from './drafts.model';
import { ValidationException } from '../../shared/exceptions';

/** Find the userId that owns a given draft slot number */
export function findUserBySlot(draftOrder: Record<string, number>, slot: number): string | null {
  for (const [userId, userSlot] of Object.entries(draftOrder)) {
    if (Number(userSlot) === Number(slot)) return userId;
  }
  return null;
}

/** Find the roster ID assigned to a user based on their draft slot */
export function findRosterIdByUserId(draft: Draft, userId: string): number | null {
  const userSlot = draft.draftOrder[userId];
  if (userSlot === undefined) return null;
  return draft.slotToRosterId[String(userSlot)] ?? null;
}

/** Find the userId that owns a given roster_id (accounts for traded picks) */
export function findUserByRosterId(
  draftOrder: Record<string, number>,
  slotToRosterId: Record<string, number>,
  rosterId: number,
): string | null {
  for (const [userId, slot] of Object.entries(draftOrder)) {
    if (slotToRosterId[String(slot)] === rosterId) return userId;
  }
  return null;
}

/** Get maximum players allowed per team (falls back to rounds) */
export function getMaxPlayersPerTeam(draft: Draft): number {
  return draft.settings.max_players_per_team || draft.settings.rounds;
}

/** Assert that a roster has a budget entry in auction_budgets. */
export function assertBudgetExists(
  budgets: Record<string, number> | undefined,
  rosterId: number,
  context: string,
): void {
  if (!budgets || !(String(rosterId) in budgets)) {
    throw new ValidationException(
      `Budget entry missing for roster ${rosterId} during ${context}.`,
    );
  }
}
