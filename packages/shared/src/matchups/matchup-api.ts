import { apiClient } from '../api/client';
import type { MatchupListResponse } from '../types/matchup';

export const matchupApi = {
  generate: (leagueId: string, token: string) =>
    apiClient.post<MatchupListResponse>(
      `/leagues/${leagueId}/matchups/generate`,
      undefined,
      token
    ),

  getAll: (leagueId: string, token: string) =>
    apiClient.get<MatchupListResponse>(
      `/leagues/${leagueId}/matchups`,
      token
    ),

  getByWeek: (leagueId: string, week: number, token: string) =>
    apiClient.get<MatchupListResponse>(
      `/leagues/${leagueId}/matchups/${week}`,
      token
    ),
};
