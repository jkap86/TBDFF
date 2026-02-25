'use client';

import { initApiClient } from '@tbdff/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

initApiClient({ baseUrl: API_URL });

export { apiClient, authApi, leagueApi, draftApi, matchupApi, scoringApi, playerApi, tradeApi, transactionApi, tokenManager, ApiError } from '@tbdff/shared';
export type { User, AuthResponse, UserResponse, League, LeagueMember, CreateLeagueRequest, UpdateLeagueRequest, LeagueInvite, PublicLeague, PublicLeaguesResponse, Roster, RosterSettings, RosterListResponse, RosterPosition, LeagueScoringSettings, LeagueSettings } from '@tbdff/shared';
export type { Draft, DraftPick, DraftType, DraftStatus, DraftSettings, CreateDraftRequest, UpdateDraftRequest, SetDraftOrderRequest, MakeDraftPickRequest, ToggleAutoPickResponse, NominateDraftPickRequest, PlaceBidRequest, NominationResponse, BidResponse, DraftQueueItem, SetDraftQueueRequest, AddToQueueRequest, UpdateQueueMaxBidRequest, DraftQueueResponse } from '@tbdff/shared';
export type { Player, PlayersListResponse } from '@tbdff/shared';
export type { Matchup, MatchupListResponse } from '@tbdff/shared';
export type { NflStateResponse, LeaguePlayerScore, LeagueScoresResponse, LeaguePlayerProjection, LeagueProjectionsResponse, GameInfo, GameScheduleResponse, PlayerGameStatus, LivePlayerScore, LiveRosterScore, LiveScoresResponse } from '@tbdff/shared';
export type { TradeProposal, TradeItem, TradeStatus, FutureDraftPick, ProposeTradeRequest, CounterTradeRequest, TradeProposalResponse, TradeListResponse, FutureDraftPickListResponse } from '@tbdff/shared';
export type { Transaction, TransactionType, WaiverClaim, WaiverClaimStatus, AddPlayerRequest, DropPlayerRequest, PlaceWaiverClaimRequest, UpdateWaiverClaimRequest, TransactionListResponse, TransactionResponse, WaiverClaimResponse, WaiverClaimListResponse } from '@tbdff/shared';
