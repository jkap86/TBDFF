import { LeagueRepository } from './leagues.repository';
import { LeagueMembersRepository } from './league-members.repository';
import { LeagueMember, LeagueInvite } from './leagues.model';
import {
  ValidationException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '../../shared/exceptions';
import { SystemMessageService } from '../chat/system-message.service';

export class LeagueInviteService {
  constructor(
    private readonly leagueRepository: LeagueRepository,
    private readonly leagueMembersRepository: LeagueMembersRepository,
    private readonly systemMessages: SystemMessageService,
  ) {}

  async createInvite(
    leagueId: string,
    inviterUserId: string,
    inviteeUsername: string,
  ): Promise<LeagueInvite> {
    // 1. Verify league exists
    const league = await this.leagueRepository.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    // 2. Verify inviter is a member and has permission
    const inviterMember = await this.leagueMembersRepository.findMember(leagueId, inviterUserId);
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
    const invitee = await this.leagueMembersRepository.findUserByUsername(inviteeUsername);
    if (!invitee) {
      throw new NotFoundException(`User '${inviteeUsername}' not found`);
    }

    // 4. Prevent self-invite
    if (invitee.id === inviterUserId) {
      throw new ValidationException('You cannot invite yourself');
    }

    // 5. Check if already a member
    const existingMember = await this.leagueMembersRepository.findMember(leagueId, invitee.id);
    if (existingMember) {
      throw new ConflictException('User is already a member of this league');
    }

    // 6. Check for existing invite
    const existingInvite = await this.leagueMembersRepository.findExistingInvite(leagueId, invitee.id);
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
    const memberCount = await this.leagueMembersRepository.getMemberCount(leagueId);
    if (memberCount >= league.totalRosters) {
      throw new ValidationException('League is full');
    }

    // 8. Create invite
    return this.leagueMembersRepository.createInvite(leagueId, inviterUserId, invitee.id);
  }

  async getLeagueInvites(leagueId: string, userId: string): Promise<LeagueInvite[]> {
    // Verify user is commissioner
    const member = await this.leagueMembersRepository.findMember(leagueId, userId);
    if (!member || member.role !== 'commissioner') {
      throw new ForbiddenException('Only commissioners can view league invites');
    }

    return this.leagueMembersRepository.findPendingInvitesByLeague(leagueId);
  }

  async getMyInvites(userId: string): Promise<LeagueInvite[]> {
    return this.leagueMembersRepository.findPendingInvitesByUser(userId);
  }

  async acceptInvite(inviteId: string, userId: string): Promise<LeagueMember> {
    // 1. Get invite
    const invite = await this.leagueMembersRepository.findInviteById(inviteId);
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
    const existingMember = await this.leagueMembersRepository.findMember(invite.leagueId, userId);
    if (existingMember) {
      // Update invite status and return existing member
      await this.leagueMembersRepository.updateInviteStatus(inviteId, 'accepted');
      return existingMember;
    }

    // 6. Add as spectator and mark invite accepted (transactional)
    const member = await this.leagueMembersRepository.acceptInviteTransaction(
      invite.leagueId, userId, inviteId,
    );

    try {
      await this.systemMessages.send(invite.leagueId, `${member.username} joined the league`);
    } catch { /* non-fatal */ }

    return member;
  }

  async declineInvite(inviteId: string, userId: string): Promise<void> {
    // 1. Get invite
    const invite = await this.leagueMembersRepository.findInviteById(inviteId);
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
    await this.leagueMembersRepository.updateInviteStatus(inviteId, 'declined');
  }

  async cancelInvite(inviteId: string, userId: string): Promise<void> {
    // 1. Get invite
    const invite = await this.leagueMembersRepository.findInviteById(inviteId);
    if (!invite) throw new NotFoundException('Invite not found');

    // 2. Verify user is the inviter or a commissioner
    const member = await this.leagueMembersRepository.findMember(invite.leagueId, userId);
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
    await this.leagueMembersRepository.deleteInvite(inviteId);
  }

  /**
   * Combined cancel-or-decline: determines the action based on who is calling.
   * If the caller is the invitee, decline; otherwise attempt cancel.
   */
  async cancelOrDeclineInvite(
    inviteId: string,
    userId: string,
  ): Promise<'declined' | 'cancelled'> {
    const invite = await this.leagueMembersRepository.findInviteById(inviteId);
    if (!invite) throw new NotFoundException('Invite not found');

    if (invite.inviteeId === userId) {
      await this.declineInvite(inviteId, userId);
      return 'declined';
    } else {
      await this.cancelInvite(inviteId, userId);
      return 'cancelled';
    }
  }
}
