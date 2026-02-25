import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { TransactionService } from './transactions.service';
import { InvalidCredentialsException } from '../../shared/exceptions';
import {
  AddPlayerInput,
  DropPlayerInput,
  PlaceWaiverClaimInput,
  UpdateWaiverClaimInput,
} from './transactions.schemas';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  list = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = param(req.params.leagueId);
    const { type, limit, offset } = req.query as { type?: string; limit?: number; offset?: number };

    const result = await this.transactionService.getTransactionFeed(leagueId, userId, { type, limit, offset });
    res.status(200).json(result);
  };

  addPlayer = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = param(req.params.leagueId);
    const body = req.body as AddPlayerInput;

    const tx = await this.transactionService.addFreeAgent(leagueId, userId, body.player_id, body.drop_player_id);
    res.status(201).json({ transaction: tx.toSafeObject() });
  };

  dropPlayer = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = param(req.params.leagueId);
    const body = req.body as DropPlayerInput;

    const tx = await this.transactionService.dropPlayer(leagueId, userId, body.player_id);
    res.status(200).json({ transaction: tx.toSafeObject() });
  };

  getWaiverClaims = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const claims = await this.transactionService.getMyWaiverClaims(param(req.params.leagueId), userId);
    res.status(200).json({ claims: claims.map((c) => c.toSafeObject()) });
  };

  placeWaiverClaim = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = param(req.params.leagueId);
    const body = req.body as PlaceWaiverClaimInput;

    const claim = await this.transactionService.placeWaiverClaim(leagueId, userId, body);
    res.status(201).json({ claim: claim.toSafeObject() });
  };

  updateWaiverClaim = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = param(req.params.leagueId);
    const claimId = param(req.params.claimId);
    const body = req.body as UpdateWaiverClaimInput;

    const claim = await this.transactionService.updateWaiverClaim(leagueId, claimId, userId, body);
    res.status(200).json({ claim: claim.toSafeObject() });
  };

  cancelWaiverClaim = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    await this.transactionService.cancelWaiverClaim(param(req.params.leagueId), param(req.params.claimId), userId);
    res.status(204).send();
  };
}
