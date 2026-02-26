import { LeagueRepository } from './leagues.repository';
import {
  League,
  LeagueMember,
  LeagueInvite,
  Roster,
  PublicLeague,
  DEFAULT_SETTINGS,
  DEFAULT_SCORING,
  DEFAULT_ROSTER_POSITIONS,
} from './leagues.model';
import {
  ValidationException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '../../shared/exceptions';
import {
  leagueSettingsFullSchema,
  scoringSettingsFullSchema,
} from './leagues.schemas';
import { DraftRepository } from '../drafts/drafts.repository';

export class LeagueService {
  constructor(
    private readonly leagueRepository: LeagueRepository,
    private readonly draftRepository: DraftRepository,
  ) {}

  async createLeague(
    userId: string,
    data: {
      name: string;
      sport?: string;
      season: string;
      totalRosters?: number;
      settings?: Record<string, number>;
      scoringSettings?: Record<string, number>;
      rosterPositions?: string[];
    },
  ): Promise<League> {
    // Validation
    const name = data.name?.trim();
    if (!name || name.length < 1 || name.length > 100) {
      throw new ValidationException('League name must be between 1 and 100 characters');
    }
    if (!data.season || !/^\d{4}$/.test(data.season)) {
      throw new ValidationException('Season must be a 4-digit year');
    }
    const totalRosters = data.totalRosters ?? 12;
    if (totalRosters < 2 || totalRosters > 32) {
      throw new ValidationException('Total rosters must be between 2 and 32');
    }

    // Merge settings over defaults
    const settings = {
      ...DEFAULT_SETTINGS,
      num_teams: totalRosters,
      ...(data.settings ?? {}),
    };
    const scoringSettings = { ...DEFAULT_SCORING, ...(data.scoringSettings ?? {}) };
    const rosterPositions = data.rosterPositions ?? DEFAULT_ROSTER_POSITIONS;

    const league = await this.leagueRepository.createLeagueWithDefaults({
      name,
      sport: data.sport ?? 'nfl',
      season: data.season,
      totalRosters,
      settings,
      scoringSettings,
      rosterPositions,
      createdBy: userId,
    });

    return league;
  }

  async getMyLeagues(userId: string): Promise<League[]> {
    return this.leagueRepository.findByUserId(userId);
  }

  async getLeagueById(leagueId: string, userId: string): Promise<League> {
    const league = await this.leagueRepository.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    // Verify user is a member
    const member = await this.leagueRepository.findMember(leagueId, userId);
    if (!member) throw new NotFoundException('League not found');

    return league;
  }

  async updateLeague(leagueId: string, userId: string, data: Record<string, any>): Promise<League> {
    const league = await this.leagueRepository.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    // Only commissioner can update
    const member = await this.leagueRepository.findMember(leagueId, userId);
    if (!member || member.role !== 'commissioner') {
      throw new ForbiddenException('Only the league commissioner can update league settings');
    }

    // Business logic validations
    if (data.name !== undefined) {
      const name = data.name.trim();
      if (name.length < 1 || name.length > 100) {
        throw new ValidationException('League name must be between 1 and 100 characters');
      }
      data.name = name;
    }

    if (data.totalRosters !== undefined) {
      if (data.totalRosters < 2 || data.totalRosters > 32) {
        throw new ValidationException('Total rosters must be between 2 and 32');
      }
      // Prevent reducing below current member count
      const currentMembers = await this.leagueRepository.getMemberCount(leagueId);
      if (data.totalRosters < currentMembers) {
        throw new ValidationException(
          `Cannot reduce total rosters to ${data.totalRosters}. League currently has ${currentMembers} members.`
        );
      }
      // Sync settings.num_teams with totalRosters
      if (!data.settings) data.settings = {};
      data.settings.num_teams = data.totalRosters;
    }

    if (data.status !== undefined) {
      // Prevent reopening completed leagues
      if (league.status === 'complete' && data.status !== 'complete') {
        throw new ValidationException('Cannot change status of a completed league');
      }
    }

    // If settings or scoring_settings are partial, merge with existing
    const updateData: Record<string, any> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.seasonType !== undefined) updateData.seasonType = data.seasonType;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.totalRosters !== undefined) updateData.totalRosters = data.totalRosters;
    if (data.avatar !== undefined) updateData.avatar = data.avatar;
    if (data.settings !== undefined) {
      const merged = { ...league.settings, ...data.settings };
      const result = leagueSettingsFullSchema.safeParse(merged);
      if (!result.success) {
        const msg = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
        throw new ValidationException(`Invalid settings: ${msg}`);
      }
      updateData.settings = merged;
    }
    if (data.scoringSettings !== undefined) {
      const merged = { ...league.scoringSettings, ...data.scoringSettings };
      const result = scoringSettingsFullSchema.safeParse(merged);
      if (!result.success) {
        const msg = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
        throw new ValidationException(`Invalid scoring settings: ${msg}`);
      }
      updateData.scoringSettings = merged;
    }
    if (data.rosterPositions !== undefined) updateData.rosterPositions = data.rosterPositions;

    const updated = await this.leagueRepository.update(leagueId, updateData);
    if (!updated) throw new NotFoundException('League not found');
    return updated;
  }

  async deleteLeague(leagueId: string, userId: string): Promise<void> {
    const league = await this.leagueRepository.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    // Only commissioner can delete
    const member = await this.leagueRepository.findMember(leagueId, userId);
    if (!member || member.role !== 'commissioner') {
      throw new ForbiddenException('Only the league commissioner can delete a league');
    }

    await this.leagueRepository.delete(leagueId);
  }

  // ---- Members ----

  async getMembers(leagueId: string, userId: string): Promise<LeagueMember[]> {
    // Verify requesting user is a member
    const member = await this.leagueRepository.findMember(leagueId, userId);
    if (!member) throw new NotFoundException('League not found');

    return this.leagueRepository.findMembersByLeagueId(leagueId);
  }

  async joinLeague(leagueId: string, userId: string): Promise<LeagueMember> {
    const league = await this.leagueRepository.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    // Check if already a member
    const existing = await this.leagueRepository.findMember(leagueId, userId);
    if (existing) throw new ConflictException('Already a member of this league');

    // Join as spectator — commissioner will assign a roster to promote to member
    return this.leagueRepository.addMember(leagueId, userId, 'spectator');
  }

  async leaveLeague(leagueId: string, userId: string): Promise<void> {
    const member = await this.leagueRepository.findMember(leagueId, userId);
    if (!member) throw new NotFoundException('Not a member of this league');
    if (member.role === 'commissioner') {
      throw new ValidationException(
        'Commissioner cannot leave the league. Transfer commissioner role or delete the league.',
      );
    }

    await this.leagueRepository.removeMemberTransaction(leagueId, userId);
  }

  async removeMember(
    leagueId: string,
    requestingUserId: string,
    targetUserId: string,
  ): Promise<void> {
    // Verify requester is commissioner
    const requester = await this.leagueRepository.findMember(leagueId, requestingUserId);
    if (!requester || requester.role !== 'commissioner') {
      throw new ForbiddenException('Only the commissioner can remove members');
    }

    const target = await this.leagueRepository.findMember(leagueId, targetUserId);
    if (!target) throw new NotFoundException('Member not found');
    if (target.role === 'commissioner') {
      throw new ForbiddenException('Cannot remove the league commissioner');
    }

    await this.leagueRepository.removeMemberTransaction(leagueId, targetUserId);
  }

  async updateMemberRole(
    leagueId: string,
    requestingUserId: string,
    targetUserId: string,
    role: string,
  ): Promise<LeagueMember> {
    if (!['commissioner', 'member', 'spectator'].includes(role)) {
      throw new ValidationException('Role must be "commissioner", "member", or "spectator"');
    }

    // Only commissioner can change roles
    const requester = await this.leagueRepository.findMember(leagueId, requestingUserId);
    if (!requester || requester.role !== 'commissioner') {
      throw new ForbiddenException('Only the league commissioner can change member roles');
    }

    const target = await this.leagueRepository.findMember(leagueId, targetUserId);
    if (!target) throw new NotFoundException('Member not found');
    if (target.role === 'commissioner') {
      throw new ForbiddenException('Cannot change the commissioner role through this endpoint');
    }

    const updated = await this.leagueRepository.updateMemberRole(leagueId, targetUserId, role);
    if (!updated) throw new NotFoundException('Member not found');
    return updated;
  }

  // ---- Public Leagues ----

  async getPublicLeagues(limit: number, offset: number): Promise<{
    leagues: PublicLeague[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const [rows, total] = await Promise.all([
      this.leagueRepository.findPublicLeagues(limit, offset),
      this.leagueRepository.countPublicLeagues(),
    ]);

    const leagues: PublicLeague[] = rows.map(row => ({
      id: row.id,
      name: row.name,
      sport: row.sport,
      season: row.season,
      status: row.status,
      total_rosters: row.total_rosters,
      avatar: row.avatar,
      settings: {
        // Only expose safe, non-sensitive settings
        num_teams: row.settings.num_teams,
        type: row.settings.type,
        playoff_teams: row.settings.playoff_teams,
        playoff_week_start: row.settings.playoff_week_start,
      },
      roster_positions: row.roster_positions,
      member_count: row.member_count,
    }));

    return { leagues, total, limit, offset };
  }

  // ---- League Invites ----

  async createInvite(
    leagueId: string,
    inviterUserId: string,
    inviteeUsername: string
  ): Promise<LeagueInvite> {
    // 1. Verify league exists
    const league = await this.leagueRepository.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    // 2. Verify inviter is a member and has permission
    const inviterMember = await this.leagueRepository.findMember(leagueId, inviterUserId);
    if (!inviterMember) {
      throw new ForbiddenException('You must be a member of this league to invite others');
    }

    // Check permission based on settings
    const canInvite =
      inviterMember.role === 'commissioner' ||
      (league.settings.member_can_invite === 1);

    if (!canInvite) {
      throw new ForbiddenException('Only commissioners can send invites for this league');
    }

    // 3. Find invitee by username
    const invitee = await this.leagueRepository.findUserByUsername(inviteeUsername);
    if (!invitee) {
      throw new NotFoundException(`User '${inviteeUsername}' not found`);
    }

    // 4. Prevent self-invite
    if (invitee.id === inviterUserId) {
      throw new ValidationException('You cannot invite yourself');
    }

    // 5. Check if already a member
    const existingMember = await this.leagueRepository.findMember(leagueId, invitee.id);
    if (existingMember) {
      throw new ConflictException('User is already a member of this league');
    }

    // 6. Check for existing invite
    const existingInvite = await this.leagueRepository.findExistingInvite(leagueId, invitee.id);
    if (existingInvite) {
      if (existingInvite.status === 'pending') {
        throw new ConflictException('An invite has already been sent to this user');
      }
      if (existingInvite.status === 'declined') {
        throw new ConflictException('This user has declined an invite to this league');
      }
      // If accepted, they should already be a member (handled above)
    }

    // 7. Check league capacity
    const memberCount = await this.leagueRepository.getMemberCount(leagueId);
    if (memberCount >= league.totalRosters) {
      throw new ValidationException('League is full');
    }

    // 8. Create invite
    return this.leagueRepository.createInvite(leagueId, inviterUserId, invitee.id);
  }

  async getLeagueInvites(leagueId: string, userId: string): Promise<LeagueInvite[]> {
    // Verify user is commissioner
    const member = await this.leagueRepository.findMember(leagueId, userId);
    if (!member || member.role !== 'commissioner') {
      throw new ForbiddenException('Only commissioners can view league invites');
    }

    return this.leagueRepository.findPendingInvitesByLeague(leagueId);
  }

  async getMyInvites(userId: string): Promise<LeagueInvite[]> {
    return this.leagueRepository.findPendingInvitesByUser(userId);
  }

  async acceptInvite(inviteId: string, userId: string): Promise<LeagueMember> {
    // 1. Get invite
    const invite = await this.leagueRepository.findInviteById(inviteId);
    if (!invite) throw new NotFoundException('Invite not found');

    // 2. Verify user is the invitee
    if (invite.inviteeId !== userId) {
      throw new ForbiddenException('You can only accept invites sent to you');
    }

    // 3. Verify invite is still pending
    if (invite.status !== 'pending') {
      throw new ConflictException(`Invite has already been ${invite.status}`);
    }

    // 4. Verify league still exists and has capacity
    const league = await this.leagueRepository.findById(invite.leagueId);
    if (!league) throw new NotFoundException('League no longer exists');

    // 5. Check if user is already a member (race condition check)
    const existingMember = await this.leagueRepository.findMember(invite.leagueId, userId);
    if (existingMember) {
      // Update invite status and return existing member
      await this.leagueRepository.updateInviteStatus(inviteId, 'accepted');
      return existingMember;
    }

    // 6. Add as spectator and mark invite accepted (transactional)
    const member = await this.leagueRepository.acceptInviteTransaction(
      invite.leagueId, userId, inviteId,
    );

    return member;
  }

  async declineInvite(inviteId: string, userId: string): Promise<void> {
    // 1. Get invite
    const invite = await this.leagueRepository.findInviteById(inviteId);
    if (!invite) throw new NotFoundException('Invite not found');

    // 2. Verify user is the invitee
    if (invite.inviteeId !== userId) {
      throw new ForbiddenException('You can only decline invites sent to you');
    }

    // 3. Verify invite is still pending
    if (invite.status !== 'pending') {
      throw new ConflictException(`Invite has already been ${invite.status}`);
    }

    // 4. Mark as declined (don't delete for audit trail)
    await this.leagueRepository.updateInviteStatus(inviteId, 'declined');
  }

  async cancelInvite(inviteId: string, userId: string): Promise<void> {
    // 1. Get invite
    const invite = await this.leagueRepository.findInviteById(inviteId);
    if (!invite) throw new NotFoundException('Invite not found');

    // 2. Verify user is the inviter or a commissioner
    const member = await this.leagueRepository.findMember(invite.leagueId, userId);
    const canCancel =
      invite.inviterId === userId ||
      (member && member.role === 'commissioner');

    if (!canCancel) {
      throw new ForbiddenException('Only the inviter or league commissioner can cancel invites');
    }

    // 3. Verify invite is still pending
    if (invite.status !== 'pending') {
      throw new ConflictException(`Invite has already been ${invite.status}`);
    }

    // 4. Delete invite (cancel = remove entirely)
    await this.leagueRepository.deleteInvite(inviteId);
  }

  // ---- Rosters ----

  async getLeagueRosters(leagueId: string, userId: string): Promise<Roster[]> {
    const member = await this.leagueRepository.findMember(leagueId, userId);
    if (!member) throw new NotFoundException('League not found');

    return this.leagueRepository.findRostersByLeagueId(leagueId);
  }

  async assignMemberToRoster(
    leagueId: string,
    requestingUserId: string,
    targetUserId: string,
    rosterId: number,
  ): Promise<{ roster: Roster; member: LeagueMember }> {
    // 1. Verify requester is commissioner
    const requester = await this.leagueRepository.findMember(leagueId, requestingUserId);
    if (!requester || requester.role !== 'commissioner') {
      throw new ForbiddenException('Only the commissioner can assign rosters');
    }

    // 2. Verify target is a league member
    const target = await this.leagueRepository.findMember(leagueId, targetUserId);
    if (!target) throw new NotFoundException('Member not found');
    if (target.role === 'commissioner') {
      throw new ValidationException('Commissioner is already assigned to a roster');
    }

    // 3. Check target doesn't already own a roster
    const existingRoster = await this.leagueRepository.findRosterByOwner(leagueId, targetUserId);
    if (existingRoster) {
      throw new ConflictException('User is already assigned to a roster');
    }

    // 4. Assign roster owner and promote to member (transactional)
    const result = await this.leagueRepository.assignRosterOwnerTransaction(leagueId, rosterId, targetUserId);

    // 5. Seed future draft picks if an active draft exists
    const activeDraft = await this.draftRepository.findActiveDraftByLeagueId(leagueId);
    if (activeDraft) {
      const league = await this.leagueRepository.findById(leagueId);
      if (league) {
        await this.draftRepository.createFutureDraftPicks(
          leagueId,
          league.season,
          activeDraft.settings.rounds,
          [{ rosterId, ownerId: targetUserId }],
        );
      }
    }

    return result;
  }

  async unassignMemberFromRoster(
    leagueId: string,
    requestingUserId: string,
    targetUserId: string,
  ): Promise<void> {
    // 1. Verify requester is commissioner
    const requester = await this.leagueRepository.findMember(leagueId, requestingUserId);
    if (!requester || requester.role !== 'commissioner') {
      throw new ForbiddenException('Only the commissioner can unassign rosters');
    }

    // 2. Verify target exists and is not the commissioner
    const target = await this.leagueRepository.findMember(leagueId, targetUserId);
    if (!target) throw new NotFoundException('Member not found');
    if (target.role === 'commissioner') {
      throw new ForbiddenException('Cannot unassign the commissioner from their roster');
    }

    // 3. Unassign roster and demote to spectator (transactional)
    await this.leagueRepository.unassignRosterOwnerTransaction(leagueId, targetUserId);
  }
}
