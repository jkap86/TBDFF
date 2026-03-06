import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { DraftService } from './drafts.service';
import { DraftQueueService } from './draft-queue.service';
import { DraftClockService } from './draft-clock.service';
import { AutoPickService } from './auto-pick.service';
import { AuctionAutoBidService } from './auction-auto-bid.service';
import { AuctionService } from './auction.service';
import { SlowAuctionService } from './slow-auction.service';
import { DerbyService } from './derby.service';
import { InvalidCredentialsException } from '../../shared/exceptions';
import { findRosterIdByUserId } from './draft-helpers';
import {
  CreateDraftInput,
  UpdateDraftInput,
  SetDraftOrderInput,
  MakeDraftPickInput,
  NominateDraftPickInput,
  PlaceBidInput,
  SetDraftQueueInput,
  AddToQueueInput,
  UpdateQueueMaxBidInput,
  SlowNominateInput,
  SlowSetMaxBidInput,
  DerbyPickInput,
} from './drafts.schemas';

export class DraftController {
  constructor(
    private readonly draftService: DraftService,
    private readonly draftQueueService: DraftQueueService,
    private readonly draftClockService: DraftClockService,
    private readonly autoPickService: AutoPickService,
    private readonly auctionAutoBidService: AuctionAutoBidService,
    private readonly auctionService: AuctionService,
    private readonly slowAuctionService: SlowAuctionService,
    private readonly derbyService: DerbyService,
  ) {}

  // ---- League-scoped ----

  create = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = Array.isArray(req.params.leagueId) ? req.params.leagueId[0] : req.params.leagueId;
    const body = req.body as CreateDraftInput;

    const draft = await this.draftService.createDraft(leagueId, userId, {
      type: body.type,
      settings: body.settings as Record<string, number> | undefined,
    });

    res.status(201).json({ draft: draft.toSafeObject() });
  };

  getByLeague = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = Array.isArray(req.params.leagueId) ? req.params.leagueId[0] : req.params.leagueId;
    const drafts = await this.draftService.getLeagueDrafts(leagueId, userId);

    res.status(200).json({ drafts: drafts.map((d) => d.toSafeObject()) });
  };

  // ---- Draft-scoped ----

  getById = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const draft = await this.draftService.getDraft(draftId, userId);

    res.status(200).json({ draft: draft.toSafeObject(), server_time: new Date().toISOString() });
  };

  update = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const body = req.body as UpdateDraftInput;

    const draft = await this.draftService.updateDraft(draftId, userId, {
      type: body.type,
      startTime: body.start_time,
      settings: body.settings as Record<string, number> | undefined,
      metadata: body.metadata,
    });

    res.status(200).json({ draft: draft.toSafeObject() });
  };

  setOrder = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const body = req.body as SetDraftOrderInput;

    const draft = await this.draftService.setDraftOrder(
      draftId,
      userId,
      body.draft_order as Record<string, number>,
      body.slot_to_roster_id as Record<string, number>,
    );

    res.status(200).json({ draft: draft.toSafeObject() });
  };

  start = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const draft = await this.draftService.startDraft(draftId, userId);

    res.status(200).json({ draft: draft.toSafeObject() });
  };

  getPicks = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const picks = await this.draftService.getDraftPicks(draftId, userId);

    res.status(200).json({ picks: picks.map((p) => p.toSafeObject()) });
  };

  makePick = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const body = req.body as MakeDraftPickInput;

    const result = await this.draftService.makePick(draftId, userId, body.player_id);

    res.status(201).json({
      pick: result.pick.toSafeObject(),
      chained_picks: result.chainedPicks.map((p) => p.toSafeObject()),
    });
  };

  autoPick = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const result = await this.autoPickService.autoPick(draftId, userId);

    res.status(201).json({
      pick: result.pick.toSafeObject(),
      chained_picks: result.chainedPicks.map((p) => p.toSafeObject()),
    });
  };

  toggleAutoPick = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const result = await this.autoPickService.toggleAutoPick(draftId, userId);

    res.status(200).json({
      draft: result.draft.toSafeObject(),
      picks: result.picks.map((p) => p.toSafeObject()),
    });
  };

  // ---- Auction-specific ----

  nominate = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const body = req.body as NominateDraftPickInput;

    const draft = await this.auctionService.nominate(draftId, userId, body.player_id, body.amount);
    res.status(200).json({ draft: draft.toSafeObject(), server_time: new Date().toISOString() });
  };

  bid = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const body = req.body as PlaceBidInput;

    const result = await this.auctionService.placeBid(draftId, userId, body.amount);
    res.status(200).json({
      draft: result.draft.toSafeObject(),
      won: result.won?.toSafeObject() ?? null,
      server_time: new Date().toISOString(),
    });
  };

  resolveNomination = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const result = await this.auctionService.resolveNomination(draftId, userId);
    res.status(200).json({
      draft: result.draft.toSafeObject(),
      won: result.won?.toSafeObject() ?? null,
      server_time: new Date().toISOString(),
    });
  };

  autoNominate = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const draft = await this.auctionService.autoNominate(draftId, userId);
    res.status(200).json({ draft: draft.toSafeObject(), server_time: new Date().toISOString() });
  };

  // ---- Available Players ----

  getAvailablePlayers = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const { position, q: query, limit, offset } = req.query as {
      position?: string;
      q?: string;
      limit?: number;
      offset?: number;
    };

    const players = await this.draftQueueService.getAvailablePlayers(draftId, userId, {
      position,
      query,
      limit,
      offset,
    });

    res.status(200).json({ players: players.map((p) => 'toSafeObject' in p ? p.toSafeObject() : p) });
  };

  // ---- Queue ----

  getQueue = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const queue = await this.draftQueueService.getQueue(draftId, userId);
    res.status(200).json({ queue });
  };

  setQueue = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const body = req.body as SetDraftQueueInput;
    const queue = await this.draftQueueService.setQueue(draftId, userId, body.player_ids);
    res.status(200).json({ queue });
  };

  addToQueue = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const body = req.body as AddToQueueInput;
    const queue = await this.draftQueueService.addToQueue(draftId, userId, body.player_id, body.max_bid);

    // Trigger auto-bid re-evaluation when a max_bid is set during an active nomination
    if (body.max_bid != null) {
      this.auctionAutoBidService.scheduleAutoBids(draftId);
    }

    res.status(200).json({ queue });
  };

  updateQueueMaxBid = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const playerId = Array.isArray(req.params.playerId) ? req.params.playerId[0] : req.params.playerId;
    const body = req.body as UpdateQueueMaxBidInput;
    const queue = await this.draftQueueService.updateQueueMaxBid(draftId, userId, playerId, body.max_bid);

    // Trigger auto-bid re-evaluation when a max_bid is set during an active nomination
    if (body.max_bid != null) {
      this.auctionAutoBidService.scheduleAutoBids(draftId);
    }

    res.status(200).json({ queue });
  };

  removeFromQueue = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const playerId = Array.isArray(req.params.playerId) ? req.params.playerId[0] : req.params.playerId;
    const queue = await this.draftQueueService.removeFromQueue(draftId, userId, playerId);
    res.status(200).json({ queue });
  };

  // ---- Slow Auction ----

  getSlowAuctionLots = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const draft = await this.draftService.getDraft(draftId, userId);
    const rosterId = findRosterIdByUserId(draft, userId);

    const results = await this.slowAuctionService.getActiveLots(draftId, rosterId ?? undefined);
    res.status(200).json({
      lots: results.map(({ lot, myMaxBid, playerMetadata }) => lot.toSafeObject(myMaxBid, playerMetadata)),
    });
  };

  getSlowAuctionLotHistory = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const lotId = Array.isArray(req.params.lotId) ? req.params.lotId[0] : req.params.lotId;
    const history = await this.slowAuctionService.getBidHistory(lotId);
    res.status(200).json({
      history: history.map((h) => ({
        id: h.id,
        lot_id: h.lotId,
        roster_id: h.rosterId,
        bid_amount: h.bidAmount,
        is_proxy: h.isProxy,
        username: h.username,
        created_at: h.createdAt,
      })),
    });
  };

  slowNominate = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const body = req.body as SlowNominateInput;

    const result = await this.slowAuctionService.nominate(draftId, userId, body.player_id);
    res.status(201).json({
      lot: result.lot.toSafeObject(undefined, result.playerMetadata),
    });
  };

  slowSetMaxBid = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const lotId = Array.isArray(req.params.lotId) ? req.params.lotId[0] : req.params.lotId;
    const body = req.body as SlowSetMaxBidInput;

    const result = await this.slowAuctionService.setMaxBid(draftId, lotId, userId, body.max_bid);
    res.status(200).json({
      lot: result.lot.toSafeObject(),
    });
  };

  getSlowAuctionBudgets = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    // Ensure user has access
    await this.draftService.getDraft(draftId, userId);

    const budgets = await this.slowAuctionService.getAllBudgets(draftId);
    res.status(200).json({ budgets });
  };

  getNominationStats = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const draft = await this.draftService.getDraft(draftId, userId);
    const rosterId = findRosterIdByUserId(draft, userId);

    if (rosterId === null) {
      res.status(200).json({
        active_nominations: 0,
        max_per_team: 0,
        global_active: 0,
        max_global: 0,
        daily_used: 0,
        daily_limit: 0,
      });
      return;
    }

    const stats = await this.slowAuctionService.getNominationStats(draftId, rosterId);
    res.status(200).json(stats);
  };

  // ---- Commissioner Draft Controls ----

  pauseDraft = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const draft = await this.draftClockService.pauseDraft(draftId, userId);

    res.status(200).json({ draft: draft.toSafeObject(), server_time: new Date().toISOString() });
  };

  stopDraft = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const draft = await this.draftClockService.stopDraft(draftId, userId);

    res.status(200).json({ draft: draft.toSafeObject(), server_time: new Date().toISOString() });
  };

  // ---- Derby (draft order selection) ----

  startDerby = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const draft = await this.derbyService.startDerby(draftId, userId);

    res.status(200).json({ draft: draft.toSafeObject(), server_time: new Date().toISOString() });
  };

  getDerbyState = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const derby = await this.derbyService.getDerbyState(draftId, userId);

    res.status(200).json({ derby, server_time: new Date().toISOString() });
  };

  makeDerbyPick = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const body = req.body as DerbyPickInput;

    const draft = await this.derbyService.makeDerbyPick(draftId, userId, body.slot);

    res.status(200).json({ draft: draft.toSafeObject(), server_time: new Date().toISOString() });
  };

  derbyAutoPick = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const draft = await this.derbyService.autoPick(draftId, userId);

    res.status(200).json({ draft: draft.toSafeObject(), server_time: new Date().toISOString() });
  };
}
