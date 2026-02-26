import { Draft } from './drafts.model';

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

/** Get maximum players allowed per team (falls back to rounds) */
export function getMaxPlayersPerTeam(draft: Draft): number {
  return draft.settings.max_players_per_team || draft.settings.rounds;
}
