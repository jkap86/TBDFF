import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { TradeService } from './trades.service';
import { InvalidCredentialsException } from '../../shared/exceptions';
import { ProposeTradeInput, CounterTradeInput } from './trades.schemas';

function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export class TradeController {
  constructor(private readonly tradeService: TradeService) {}

  propose = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = param(req.params.leagueId);
    const body = req.body as ProposeTradeInput;

    const trade = await this.tradeService.proposeTrade(leagueId, userId, body);
    res.status(201).json({ trade: trade.toSafeObject() });
  };

  list = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = param(req.params.leagueId);
    const status = req.query.status as string | undefined;

    const trades = await this.tradeService.getLeagueTrades(leagueId, userId, status);
    res.status(200).json({ trades: trades.map((t) => t.toSafeObject()) });
  };

  getById = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const tradeId = param(req.params.tradeId);
    const trade = await this.tradeService.getTradeById(tradeId, userId);
    res.status(200).json({ trade: trade.toSafeObject() });
  };

  accept = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const trade = await this.tradeService.acceptTrade(param(req.params.tradeId), userId);
    res.status(200).json({ trade: trade.toSafeObject() });
  };

  decline = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const trade = await this.tradeService.declineTrade(param(req.params.tradeId), userId);
    res.status(200).json({ trade: trade.toSafeObject() });
  };

  withdraw = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const trade = await this.tradeService.withdrawTrade(param(req.params.tradeId), userId);
    res.status(200).json({ trade: trade.toSafeObject() });
  };

  counter = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const body = req.body as CounterTradeInput;
    const trade = await this.tradeService.counterTrade(param(req.params.tradeId), userId, body);
    res.status(201).json({ trade: trade.toSafeObject() });
  };

  veto = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const trade = await this.tradeService.vetoTrade(param(req.params.tradeId), userId);
    res.status(200).json({ trade: trade.toSafeObject() });
  };

  push = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const trade = await this.tradeService.pushTrade(param(req.params.tradeId), userId);
    res.status(200).json({ trade: trade.toSafeObject() });
  };

  getFuturePicks = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const picks = await this.tradeService.getFuturePicks(param(req.params.leagueId), userId);
    res.status(200).json({ picks: picks.map((p) => p.toSafeObject()) });
  };

  getUserFuturePicks = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const picks = await this.tradeService.getUserFuturePicks(param(req.params.leagueId), userId, param(req.params.userId));
    res.status(200).json({ picks: picks.map((p) => p.toSafeObject()) });
  };
}
