import { apiClient } from '../api/client';
import type { MatchupListResponse, MatchupDerbyResponse, MatchupDerbyPickRequest } from '../types/matchup';

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

  // Matchup Derby
  startDerby: (leagueId: string, token: string) =>
    apiClient.post<MatchupDerbyResponse>(
      `/leagues/${leagueId}/matchups/derby/start`,
      undefined,
      token
    ),

  getDerby: (leagueId: string, token: string) =>
    apiClient.get<MatchupDerbyResponse>(
      `/leagues/${leagueId}/matchups/derby`,
      token
    ),

  makeDerbyPick: (leagueId: string, body: MatchupDerbyPickRequest, token: string) =>
    apiClient.post<MatchupDerbyResponse>(
      `/leagues/${leagueId}/matchups/derby/pick`,
      body,
      token
    ),

  derbyAutoPick: (leagueId: string, token: string) =>
    apiClient.post<MatchupDerbyResponse>(
      `/leagues/${leagueId}/matchups/derby/autopick`,
      undefined,
      token
    ),

  updateDerbySettings: (leagueId: string, body: { timer: number; timeout: number }, token: string) =>
    apiClient.patch<MatchupDerbyResponse>(
      `/leagues/${leagueId}/matchups/derby/settings`,
      body,
      token
    ),
};
