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

};
