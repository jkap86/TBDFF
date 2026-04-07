import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { ScoringService } from './scoring.service';
import { InvalidCredentialsException } from '../../shared/exceptions';

export class ScoringController {
  constructor(private readonly scoringService: ScoringService) {}

  getNflState = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const state = await this.scoringService.getNflState();
    res.status(200).json(state);
  };

  getLeagueScores = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = Array.isArray(req.params.leagueId)
      ? req.params.leagueId[0]
      : req.params.leagueId;
    const weekParam = Array.isArray(req.params.week)
      ? req.params.week[0]
      : req.params.week;
    const week = parseInt(weekParam, 10);

    const scores = await this.scoringService.getLeaguePlayerScores(leagueId, week, userId);
    res.status(200).json({ scores });
  };

  getLeagueProjections = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = Array.isArray(req.params.leagueId)
      ? req.params.leagueId[0]
      : req.params.leagueId;
    const weekParam = Array.isArray(req.params.week)
      ? req.params.week[0]
      : req.params.week;
    const week = parseInt(weekParam, 10);

    const projections = await this.scoringService.getLeaguePlayerProjections(
      leagueId,
      week,
      userId,
    );
    res.status(200).json({ projections });
  };

  getGameSchedule = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const seasonParam = Array.isArray(req.params.season)
      ? req.params.season[0]
      : req.params.season;
    const weekParam = Array.isArray(req.params.week)
      ? req.params.week[0]
      : req.params.week;
    const week = parseInt(weekParam, 10);
    const seasonType = (req.query.season_type as string) || 'regular';

    const games = await this.scoringService.getGameSchedule(seasonParam, week, seasonType);
    res.status(200).json({ games });
  };

  getLiveScores = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = Array.isArray(req.params.leagueId)
      ? req.params.leagueId[0]
      : req.params.leagueId;
    const weekParam = Array.isArray(req.params.week)
      ? req.params.week[0]
      : req.params.week;
    const week = parseInt(weekParam, 10);

    const result = await this.scoringService.getLiveScores(leagueId, week, userId);
    res.status(200).json(result);
  };

}
