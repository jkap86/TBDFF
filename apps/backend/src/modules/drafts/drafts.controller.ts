import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { DraftService } from './drafts.service';
import { InvalidCredentialsException } from '../../shared/exceptions';
import {
  CreateDraftInput,
  UpdateDraftInput,
  SetDraftOrderInput,
  MakeDraftPickInput,
} from './drafts.schemas';

export class DraftController {
  constructor(private readonly draftService: DraftService) {}

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

    res.status(200).json({ draft: draft.toSafeObject() });
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
    const result = await this.draftService.autoPick(draftId, userId);

    res.status(201).json({
      pick: result.pick.toSafeObject(),
      chained_picks: result.chainedPicks.map((p) => p.toSafeObject()),
    });
  };

  toggleAutoPick = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const draftId = Array.isArray(req.params.draftId) ? req.params.draftId[0] : req.params.draftId;
    const result = await this.draftService.toggleAutoPick(draftId, userId);

    res.status(200).json({
      draft: result.draft.toSafeObject(),
      picks: result.picks.map((p) => p.toSafeObject()),
    });
  };
}
