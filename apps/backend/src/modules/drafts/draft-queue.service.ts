import { DraftRepository } from './drafts.repository';
import { LeagueRepository } from '../leagues/leagues.repository';
import { Draft } from './drafts.model';
import { Player } from '../players/players.model';
import {
  ValidationException,
  NotFoundException,
  ForbiddenException,
} from '../../shared/exceptions';

export class DraftQueueService {
  constructor(
    private readonly draftRepository: DraftRepository,
    private readonly leagueRepository: LeagueRepository,
  ) {}

  async getAvailablePlayers(
    draftId: string,
    userId: string,
    options: { position?: string; query?: string; limit?: number; offset?: number },
  ): Promise<(Player | Record<string, any>)[]> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');

    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    const limit = Math.min(options.limit ?? 50, 200);
    const offset = options.offset ?? 0;

    // If vet draft with include_rookie_picks, mix in rookie draft picks
    if (draft.settings.include_rookie_picks === 1 && draft.settings.player_type === 2) {
      return this.getAvailableWithRookiePicks(draft, draftId, { ...options, limit, offset });
    }

    return this.draftRepository.findAvailablePlayers(draftId, {
      position: options.position,
      query: options.query,
      limit,
      offset,
      playerType: draft.settings.player_type,
    });
  }

  private async getAvailableWithRookiePicks(
    draft: Draft,
    draftId: string,
    options: { position?: string; query?: string; limit: number; offset: number },
  ): Promise<(Player | Record<string, any>)[]> {
    // If filtering by a real position, return only real players
    if (options.position && options.position !== 'PICK') {
      return this.draftRepository.findAvailablePlayers(draftId, {
        position: options.position,
        query: options.query,
        limit: options.limit,
        offset: options.offset,
        playerType: draft.settings.player_type,
      });
    }

    // Find the rookie draft for this league
    const leagueDrafts = await this.draftRepository.findByLeagueId(draft.leagueId);
    const rookieDraft = leagueDrafts.find(
      (d) => d.settings.player_type === 1 && d.id !== draftId,
    );

    if (!rookieDraft) {
      // No rookie draft found — return normal players
      if (options.position === 'PICK') return [];
      return this.draftRepository.findAvailablePlayers(draftId, {
        position: options.position,
        query: options.query,
        limit: options.limit,
        offset: options.offset,
        playerType: draft.settings.player_type,
      });
    }

    // Generate all rookie pick items
    const rookieRounds = rookieDraft.settings.rounds;
    const rookieTeams = rookieDraft.settings.teams;
    const allRookiePicks: Record<string, any>[] = [];
    for (let round = 1; round <= rookieRounds; round++) {
      for (let pick = 1; pick <= rookieTeams; pick++) {
        const pickLabel = `${round}.${String(pick).padStart(2, '0')}`;
        allRookiePicks.push({
          id: `rpick:${round}:${pick}`,
          first_name: 'Rookie Pick',
          last_name: pickLabel,
          full_name: `Rookie Pick ${pickLabel}`,
          position: 'PICK',
          fantasy_positions: [],
          team: `R${round}`,
          active: true,
          injury_status: null,
          years_exp: null,
          age: null,
          jersey_number: null,
          search_rank: round * 100 + pick, // sort by round then pick
          auction_value: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }

    // Filter out already-drafted rookie picks in this vet draft
    const vetPicks = await this.draftRepository.findPicksByDraftId(draftId);
    const draftedRpickIds = new Set(
      vetPicks.filter((p) => p.playerId?.startsWith('rpick:')).map((p) => p.playerId),
    );
    const allAvailable = allRookiePicks.filter((rp) => !draftedRpickIds.has(rp.id));
    // Only expose the next available pick, not all of them
    let availableRookiePicks = allAvailable.length > 0 ? [allAvailable[0]] : [];

    // Apply search query filter to rookie picks
    if (options.query) {
      const q = options.query.toLowerCase();
      availableRookiePicks = availableRookiePicks.filter(
        (rp) => rp.full_name.toLowerCase().includes(q) || rp.last_name.toLowerCase().includes(q),
      );
    }

    // If filtering by PICK position, return only rookie picks
    if (options.position === 'PICK') {
      return availableRookiePicks.slice(options.offset, options.offset + options.limit);
    }

    // Mix: rookie picks first, then real players
    const totalRookiePicks = availableRookiePicks.length;

    if (options.offset < totalRookiePicks) {
      // Some rookie picks still need to be shown
      const rookieSlice = availableRookiePicks.slice(options.offset, options.offset + options.limit);
      const remaining = options.limit - rookieSlice.length;
      if (remaining > 0) {
        const players = await this.draftRepository.findAvailablePlayers(draftId, {
          position: options.position,
          query: options.query,
          limit: remaining,
          offset: 0,
          playerType: draft.settings.player_type,
        });
        return [...rookieSlice, ...players];
      }
      return rookieSlice;
    }

    // Past the rookie picks, return only real players with adjusted offset
    const playerOffset = options.offset - totalRookiePicks;
    return this.draftRepository.findAvailablePlayers(draftId, {
      position: options.position,
      query: options.query,
      limit: options.limit,
      offset: playerOffset,
      playerType: draft.settings.player_type,
    });
  }

  async getQueue(draftId: string, userId: string): Promise<any[]> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');

    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    return this.draftRepository.getQueue(draftId, userId);
  }

  async setQueue(draftId: string, userId: string, playerIds: string[]): Promise<any[]> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.status === 'complete') throw new ValidationException('Draft is already complete');

    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    await this.draftRepository.setQueue(draftId, userId, playerIds);
    return this.draftRepository.getQueue(draftId, userId);
  }

  async addToQueue(
    draftId: string,
    userId: string,
    playerId: string,
    maxBid?: number | null,
  ): Promise<any[]> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.status === 'complete') throw new ValidationException('Draft is already complete');

    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    await this.draftRepository.addToQueue(draftId, userId, playerId, maxBid);
    return this.draftRepository.getQueue(draftId, userId);
  }

  async updateQueueMaxBid(
    draftId: string,
    userId: string,
    playerId: string,
    maxBid: number | null,
  ): Promise<any[]> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.status === 'complete') throw new ValidationException('Draft is already complete');

    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    await this.draftRepository.updateQueueItemMaxBid(draftId, userId, playerId, maxBid);
    return this.draftRepository.getQueue(draftId, userId);
  }

  async removeFromQueue(draftId: string, userId: string, playerId: string): Promise<any[]> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.status === 'complete') throw new ValidationException('Draft is already complete');

    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    await this.draftRepository.removeFromQueue(draftId, userId, playerId);
    return this.draftRepository.getQueue(draftId, userId);
  }
}
