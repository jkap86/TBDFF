import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { LeagueService } from './leagues.service';
import { InvalidCredentialsException } from '../../shared/exceptions';

export class LeagueController {
  constructor(private readonly leagueService: LeagueService) {}

  create = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const league = await this.leagueService.createLeague(userId, {
      name: req.body.name,
      sport: req.body.sport,
      season: req.body.season,
      totalRosters: req.body.total_rosters,
      settings: req.body.settings,
      scoringSettings: req.body.scoring_settings,
      rosterPositions: req.body.roster_positions,
    });

    res.status(201).json({ league: league.toSafeObject() });
  };

  getMyLeagues = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagues = await this.leagueService.getMyLeagues(userId);
    res.status(200).json({ leagues: leagues.map((l) => l.toSafeObject()) });
  };

  getById = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = Array.isArray(req.params.leagueId) ? req.params.leagueId[0] : req.params.leagueId;
    const league = await this.leagueService.getLeagueById(leagueId, userId);
    res.status(200).json({ league: league.toSafeObject() });
  };

  update = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = Array.isArray(req.params.leagueId) ? req.params.leagueId[0] : req.params.leagueId;
    const league = await this.leagueService.updateLeague(leagueId, userId, {
      name: req.body.name,
      seasonType: req.body.season_type,
      status: req.body.status,
      totalRosters: req.body.total_rosters,
      avatar: req.body.avatar,
      settings: req.body.settings,
      scoringSettings: req.body.scoring_settings,
      rosterPositions: req.body.roster_positions,
    });

    res.status(200).json({ league: league.toSafeObject() });
  };

  delete = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = Array.isArray(req.params.leagueId) ? req.params.leagueId[0] : req.params.leagueId;
    await this.leagueService.deleteLeague(leagueId, userId);
    res.status(200).json({ message: 'League deleted' });
  };

  // ---- Members ----

  getMembers = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = Array.isArray(req.params.leagueId) ? req.params.leagueId[0] : req.params.leagueId;
    const members = await this.leagueService.getMembers(leagueId, userId);
    res.status(200).json({ members: members.map((m) => m.toSafeObject()) });
  };

  join = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = Array.isArray(req.params.leagueId) ? req.params.leagueId[0] : req.params.leagueId;
    const member = await this.leagueService.joinLeague(leagueId, userId);
    res.status(201).json({ member: member.toSafeObject() });
  };

  leave = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = Array.isArray(req.params.leagueId) ? req.params.leagueId[0] : req.params.leagueId;
    await this.leagueService.leaveLeague(leagueId, userId);
    res.status(200).json({ message: 'Left league' });
  };

  removeMember = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = Array.isArray(req.params.leagueId) ? req.params.leagueId[0] : req.params.leagueId;
    const targetUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    await this.leagueService.removeMember(leagueId, userId, targetUserId);
    res.status(200).json({ message: 'Member removed' });
  };

  updateMemberRole = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = Array.isArray(req.params.leagueId) ? req.params.leagueId[0] : req.params.leagueId;
    const targetUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    const member = await this.leagueService.updateMemberRole(
      leagueId,
      userId,
      targetUserId,
      req.body.role
    );
    res.status(200).json({ member: member.toSafeObject() });
  };
}
