'use client';

import { initApiClient } from '@tbdff/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

initApiClient({ baseUrl: API_URL });

export { apiClient, authApi, leagueApi, draftApi, tokenManager, ApiError } from '@tbdff/shared';
export type { User, AuthResponse, UserResponse, League, LeagueMember, CreateLeagueRequest, UpdateLeagueRequest, LeagueInvite, PublicLeague, PublicLeaguesResponse, Roster, RosterSettings, RosterListResponse } from '@tbdff/shared';
export type { Draft, DraftPick, DraftType, DraftStatus, DraftSettings, CreateDraftRequest, UpdateDraftRequest, SetDraftOrderRequest, MakeDraftPickRequest } from '@tbdff/shared';
