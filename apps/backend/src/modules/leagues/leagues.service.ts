import { LeagueRepository } from './leagues.repository';
import {
  League,
  LeagueMember,
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

export class LeagueService {
  constructor(private readonly leagueRepository: LeagueRepository) {}

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

    const league = await this.leagueRepository.create({
      name,
      sport: data.sport ?? 'nfl',
      season: data.season,
      totalRosters,
      settings,
      scoringSettings,
      rosterPositions,
      createdBy: userId,
    });

    // Auto-add creator as owner
    await this.leagueRepository.addMember(league.id, userId, 'commissioner');

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

    // Only owner/commissioner can update
    const member = await this.leagueRepository.findMember(leagueId, userId);
    if (!member || (member.role !== 'owner' && member.role !== 'commissioner')) {
      throw new ForbiddenException('Only league owner or commissioner can update league settings');
    }

    // If settings or scoring_settings are partial, merge with existing
    const updateData: Record<string, any> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.seasonType !== undefined) updateData.seasonType = data.seasonType;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.totalRosters !== undefined) updateData.totalRosters = data.totalRosters;
    if (data.avatar !== undefined) updateData.avatar = data.avatar;
    if (data.settings !== undefined) {
      updateData.settings = { ...league.settings, ...data.settings };
    }
    if (data.scoringSettings !== undefined) {
      updateData.scoringSettings = { ...league.scoringSettings, ...data.scoringSettings };
    }
    if (data.rosterPositions !== undefined) updateData.rosterPositions = data.rosterPositions;

    const updated = await this.leagueRepository.update(leagueId, updateData);
    if (!updated) throw new NotFoundException('League not found');
    return updated;
  }

  async deleteLeague(leagueId: string, userId: string): Promise<void> {
    const league = await this.leagueRepository.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    // Only owner can delete
    const member = await this.leagueRepository.findMember(leagueId, userId);
    if (!member || member.role !== 'owner') {
      throw new ForbiddenException('Only the league owner can delete a league');
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

    // Check capacity
    const count = await this.leagueRepository.getMemberCount(leagueId);
    if (count >= league.totalRosters) {
      throw new ValidationException('League is full');
    }

    return this.leagueRepository.addMember(leagueId, userId, 'member');
  }

  async leaveLeague(leagueId: string, userId: string): Promise<void> {
    const member = await this.leagueRepository.findMember(leagueId, userId);
    if (!member) throw new NotFoundException('Not a member of this league');
    if (member.role === 'owner') {
      throw new ValidationException(
        'Owner cannot leave the league. Transfer ownership or delete the league.',
      );
    }

    await this.leagueRepository.removeMember(leagueId, userId);
  }

  async removeMember(
    leagueId: string,
    requestingUserId: string,
    targetUserId: string,
  ): Promise<void> {
    // Verify requester is owner/commissioner
    const requester = await this.leagueRepository.findMember(leagueId, requestingUserId);
    if (!requester || (requester.role !== 'owner' && requester.role !== 'commissioner')) {
      throw new ForbiddenException('Only owner or commissioner can remove members');
    }

    const target = await this.leagueRepository.findMember(leagueId, targetUserId);
    if (!target) throw new NotFoundException('Member not found');
    if (target.role === 'owner') {
      throw new ForbiddenException('Cannot remove the league owner');
    }

    await this.leagueRepository.removeMember(leagueId, targetUserId);
  }

  async updateMemberRole(
    leagueId: string,
    requestingUserId: string,
    targetUserId: string,
    role: string,
  ): Promise<LeagueMember> {
    if (!['commissioner', 'member'].includes(role)) {
      throw new ValidationException('Role must be "commissioner" or "member"');
    }

    // Only owner can change roles
    const requester = await this.leagueRepository.findMember(leagueId, requestingUserId);
    if (!requester || requester.role !== 'owner') {
      throw new ForbiddenException('Only the league owner can change member roles');
    }

    const target = await this.leagueRepository.findMember(leagueId, targetUserId);
    if (!target) throw new NotFoundException('Member not found');
    if (target.role === 'owner') {
      throw new ForbiddenException('Cannot change the owner role through this endpoint');
    }

    const updated = await this.leagueRepository.updateMemberRole(leagueId, targetUserId, role);
    if (!updated) throw new NotFoundException('Member not found');
    return updated;
  }
}
