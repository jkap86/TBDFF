import { Request, Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { LeagueService } from './leagues.service';
import { LeagueInviteService } from './league-invite.service';
import { LeagueRosterService } from './league-roster.service';
import { InvalidCredentialsException, NotFoundException } from '../../shared/exceptions';
import { UpdateLeagueInput, CreateInviteInput, UpdateLineupInput } from './leagues.schemas';

export class LeagueController {
  constructor(
    private readonly leagueService: LeagueService,
    private readonly leagueInviteService: LeagueInviteService,
    private readonly leagueRosterService: LeagueRosterService,
  ) {}

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

    // req.body is validated by updateLeagueSchema middleware
    const validatedData = req.body as UpdateLeagueInput;

    const league = await this.leagueService.updateLeague(leagueId, userId, {
      name: validatedData.name,
      seasonType: validatedData.season_type,
      status: validatedData.status,
      totalRosters: validatedData.total_rosters,
      avatar: validatedData.avatar,
      settings: validatedData.settings,
      scoringSettings: validatedData.scoring_settings,
      rosterPositions: validatedData.roster_positions,
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

  // ---- Public Leagues ----

  getPublicLeagues = async (req: Request, res: Response): Promise<void> => {
    // No auth required - this is a public endpoint
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await this.leagueService.getPublicLeagues(limit, offset);
    res.status(200).json(result);
  };

  // ---- League Invites ----

  createInvite = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = Array.isArray(req.params.leagueId)
      ? req.params.leagueId[0]
      : req.params.leagueId;

    const { username } = req.body as CreateInviteInput;

    const invite = await this.leagueInviteService.createInvite(leagueId, userId, username);
    res.status(201).json({ invite: invite.toSafeObject() });
  };

  getLeagueInvites = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = Array.isArray(req.params.leagueId)
      ? req.params.leagueId[0]
      : req.params.leagueId;

    const invites = await this.leagueInviteService.getLeagueInvites(leagueId, userId);
    res.status(200).json({ invites: invites.map(i => i.toSafeObject()) });
  };

  getMyInvites = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const invites = await this.leagueInviteService.getMyInvites(userId);
    res.status(200).json({ invites: invites.map(i => i.toSafeObject()) });
  };

  acceptInvite = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const inviteId = Array.isArray(req.params.inviteId)
      ? req.params.inviteId[0]
      : req.params.inviteId;

    const member = await this.leagueInviteService.acceptInvite(inviteId, userId);
    res.status(200).json({ member: member.toSafeObject() });
  };

  cancelOrDeclineInvite = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const inviteId = Array.isArray(req.params.inviteId)
      ? req.params.inviteId[0]
      : req.params.inviteId;

    const result = await this.leagueInviteService.cancelOrDeclineInvite(inviteId, userId);
    res.status(200).json({ message: result === 'declined' ? 'Invite declined' : 'Invite cancelled' });
  };

  // ---- Rosters ----

  getRosters = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = Array.isArray(req.params.leagueId)
      ? req.params.leagueId[0]
      : req.params.leagueId;

    const rosters = await this.leagueRosterService.getLeagueRosters(leagueId, userId);
    res.status(200).json({ rosters: rosters.map((r) => r.toSafeObject()) });
  };

  assignRoster = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = Array.isArray(req.params.leagueId)
      ? req.params.leagueId[0]
      : req.params.leagueId;
    const rosterIdParam = Array.isArray(req.params.rosterId) ? req.params.rosterId[0] : req.params.rosterId;
    const rosterId = parseInt(rosterIdParam, 10);
    const targetUserId = req.body.user_id;

    const result = await this.leagueRosterService.assignMemberToRoster(
      leagueId,
      userId,
      targetUserId,
      rosterId,
    );
    res.status(200).json({
      roster: result.roster.toSafeObject(),
      member: result.member.toSafeObject(),
    });
  };

  updateLineup = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = Array.isArray(req.params.leagueId) ? req.params.leagueId[0] : req.params.leagueId;
    const rosterIdParam = Array.isArray(req.params.rosterId) ? req.params.rosterId[0] : req.params.rosterId;
    const rosterId = parseInt(rosterIdParam, 10);
    const { starters } = req.body as UpdateLineupInput;

    const roster = await this.leagueRosterService.updateLineup(leagueId, userId, rosterId, starters);
    res.status(200).json({ roster: roster.toSafeObject() });
  };

  unassignRoster = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) throw new InvalidCredentialsException();

    const leagueId = Array.isArray(req.params.leagueId)
      ? req.params.leagueId[0]
      : req.params.leagueId;
    const rosterIdParam = Array.isArray(req.params.rosterId) ? req.params.rosterId[0] : req.params.rosterId;
    const rosterId = parseInt(rosterIdParam, 10);

    // Find who owns this roster to unassign them
    const rosters = await this.leagueRosterService.getLeagueRosters(leagueId, userId);
    const roster = rosters.find((r) => r.rosterId === rosterId);
    if (!roster || !roster.ownerId) throw new NotFoundException('Roster not found or not assigned');

    await this.leagueRosterService.unassignMemberFromRoster(leagueId, userId, roster.ownerId);
    res.status(200).json({ message: 'Roster unassigned' });
  };
}
