import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { MatchupService } from './matchups.service';
import { MatchupDerbyService } from './matchup-derby.service';
import { InvalidCredentialsException } from '../../shared/exceptions';

export class MatchupController {
  constructor(
    private readonly matchupService: MatchupService,
    private readonly matchupDerbyService: MatchupDerbyService,
  ) {}

  generate = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = Array.isArray(req.params.leagueId) ? req.params.leagueId[0] : req.params.leagueId;
    const matchups = await this.matchupService.generateMatchups(leagueId, userId);

    res.status(201).json({ matchups: matchups.map((m) => m.toSafeObject()) });
  };

  getAll = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = Array.isArray(req.params.leagueId) ? req.params.leagueId[0] : req.params.leagueId;
    const matchups = await this.matchupService.getMatchups(leagueId, userId);

    res.status(200).json({ matchups: matchups.map((m) => m.toSafeObject()) });
  };

  getByWeek = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = Array.isArray(req.params.leagueId) ? req.params.leagueId[0] : req.params.leagueId;
    const weekParam = Array.isArray(req.params.week) ? req.params.week[0] : req.params.week;
    const week = parseInt(weekParam, 10);
    const matchups = await this.matchupService.getMatchupsByWeek(leagueId, week, userId);

    res.status(200).json({ matchups: matchups.map((m) => m.toSafeObject()) });
  };

  // Matchup Derby endpoints

  startDerby = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = Array.isArray(req.params.leagueId) ? req.params.leagueId[0] : req.params.leagueId;
    const derby = await this.matchupDerbyService.startDerby(leagueId, userId);

    res.status(201).json({ derby: derby.toSafeObject(), server_time: new Date().toISOString() });
  };

  getDerbyState = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = Array.isArray(req.params.leagueId) ? req.params.leagueId[0] : req.params.leagueId;
    const derby = await this.matchupDerbyService.getDerbyState(leagueId, userId);

    if (!derby) {
      res.status(200).json({ derby: null, server_time: new Date().toISOString() });
      return;
    }

    res.status(200).json({ derby: derby.toSafeObject(), server_time: new Date().toISOString() });
  };

  makeDerbyPick = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = Array.isArray(req.params.leagueId) ? req.params.leagueId[0] : req.params.leagueId;
    const { opponent_roster_id, week } = req.body;
    const derby = await this.matchupDerbyService.makePick(leagueId, userId, opponent_roster_id, week);

    res.status(200).json({ derby: derby.toSafeObject(), server_time: new Date().toISOString() });
  };

  derbyAutoPick = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = Array.isArray(req.params.leagueId) ? req.params.leagueId[0] : req.params.leagueId;
    const derby = await this.matchupDerbyService.autoPick(leagueId, userId);

    res.status(200).json({ derby: derby.toSafeObject(), server_time: new Date().toISOString() });
  };
}
