import { apiClient } from '../api/client';
import type {
  NflStateResponse,
  LeagueScoresResponse,
  LeagueProjectionsResponse,
  GameScheduleResponse,
  LiveScoresResponse,
} from '../types/scoring';

export const scoringApi = {
  getNflState: (token: string) =>
    apiClient.get<NflStateResponse>('/scoring/nfl-state', token),

  getLeagueScores: (leagueId: string, week: number, token: string) =>
    apiClient.get<LeagueScoresResponse>(`/leagues/${leagueId}/scores/${week}`, token),

  getLeagueProjections: (leagueId: string, week: number, token: string) =>
    apiClient.get<LeagueProjectionsResponse>(
      `/leagues/${leagueId}/projections/${week}`,
      token,
    ),

  getLiveScores: (leagueId: string, week: number, token: string) =>
    apiClient.get<LiveScoresResponse>(`/leagues/${leagueId}/live/${week}`, token),

  getGameSchedule: (season: string, week: number, token: string, seasonType?: string) =>
    apiClient.get<GameScheduleResponse>(
      `/scoring/schedule/${season}/${week}${seasonType ? `?season_type=${seasonType}` : ''}`,
      token,
    ),

  syncStats: (token: string, season?: string, week?: number, seasonType?: string) => {
    const params = new URLSearchParams();
    if (season) params.set('season', season);
    if (week) params.set('week', String(week));
    if (seasonType) params.set('season_type', seasonType);
    const qs = params.toString();
    return apiClient.post<{
      stats: { synced: number; skipped: number };
      projections: { synced: number; skipped: number };
      synced_for: { season: string; week: number; season_type: string };
    }>(`/scoring/sync${qs ? `?${qs}` : ''}`, undefined, token);
  },
};
