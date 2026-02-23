// Domain-agnostic player data (normalized)
export interface PlayerData {
  externalId: string;               // Provider's unique ID
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  position: string | null;
  fantasyPositions: string[];
  team: string | null;
  active: boolean;
  injuryStatus: string | null;
  yearsExp: number | null;
  age: number | null;
  jerseyNumber: number | null;
  searchRank: number | null;
}

// Provider interface - all providers must implement
export interface PlayerDataProvider {
  readonly providerName: string;          // 'sleeper', 'espn', etc.

  fetchAllPlayers(): Promise<PlayerData[]>;
  fetchPlayer(externalId: string): Promise<PlayerData | null>;
}
