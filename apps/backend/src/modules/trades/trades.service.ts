import { PoolClient } from 'pg';
import { TradeRepository } from './trades.repository';
import { TradeProposal, FutureDraftPick } from './trades.model';
import { LeagueRepository } from '../leagues/leagues.repository';
import { TransactionsGateway } from '../transactions/transactions.gateway';
import {
  NotFoundException,
  ForbiddenException,
  ValidationException,
} from '../../shared/exceptions';

export class TradeService {
  private gateway: TransactionsGateway | null = null;

  constructor(
    private readonly tradeRepo: TradeRepository,
    private readonly leagueRepo: LeagueRepository,
  ) {}

  setGateway(gw: TransactionsGateway): void {
    this.gateway = gw;
  }

  async proposeTrade(
    leagueId: string,
    userId: string,
    request: {
      proposed_to: string;
      message?: string;
      items: Array<{
        side: string;
        item_type: string;
        player_id?: string;
        draft_pick_id?: string;
        faab_amount?: number;
        roster_id: number;
      }>;
    },
  ): Promise<TradeProposal> {
    // Validate membership
    const member = await this.leagueRepo.findMember(leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    const receiver = await this.leagueRepo.findMember(leagueId, request.proposed_to);
    if (!receiver) throw new ValidationException('Trade partner is not a member of this league');

    if (userId === request.proposed_to) throw new ValidationException('Cannot trade with yourself');

    // Validate trade deadline
    const league = await this.leagueRepo.findById(leagueId);
    if (!league) throw new NotFoundException('League not found');

    if (league.settings.trade_deadline && league.settings.leg > league.settings.trade_deadline) {
      throw new ValidationException('Trade deadline has passed');
    }

    // Validate items have both sides
    const hasBothSides =
      request.items.some((i) => i.side === 'proposer') &&
      request.items.some((i) => i.side === 'receiver');
    if (!hasBothSides) throw new ValidationException('Trade must include items from both sides');

    // Validate player ownership
    const proposerRoster = await this.leagueRepo.findRosterByOwner(leagueId, userId);
    const receiverRoster = await this.leagueRepo.findRosterByOwner(leagueId, request.proposed_to);
    if (!proposerRoster || !receiverRoster) throw new ValidationException('Both users must own a roster');

    for (const item of request.items) {
      if (item.item_type === 'player' && item.player_id) {
        const roster = item.side === 'proposer' ? proposerRoster : receiverRoster;
        if (!roster.players.includes(item.player_id)) {
          throw new ValidationException(`Player ${item.player_id} is not on the expected roster`);
        }
      }
    }

    return this.tradeRepo.withTransaction(async (client) => {
      const proposal = await this.tradeRepo.createProposal(client, {
        leagueId,
        proposedBy: userId,
        proposedTo: request.proposed_to,
        message: request.message,
      });

      const items = await this.tradeRepo.createItems(client, proposal.id, request.items);

      const trade = await this.tradeRepo.findProposalById(proposal.id);

      this.gateway?.broadcastToLeague(leagueId, 'trade:proposed', { trade: trade!.toSafeObject() });
      this.gateway?.broadcastToUser(request.proposed_to, 'trade:proposed', { trade: trade!.toSafeObject() });

      return trade!;
    });
  }

  async acceptTrade(tradeId: string, userId: string): Promise<TradeProposal> {
    const trade = await this.tradeRepo.findProposalById(tradeId);
    if (!trade) throw new NotFoundException('Trade not found');
    if (trade.proposedTo !== userId) throw new ForbiddenException('Only the receiver can accept this trade');
    if (trade.status !== 'pending') throw new ValidationException('Trade is not in pending status');

    const league = await this.leagueRepo.findById(trade.leagueId);
    if (!league) throw new NotFoundException('League not found');

    const reviewDays = league.settings.trade_review_days ?? 0;

    if (reviewDays > 0) {
      // Enter review period
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + reviewDays);

      return this.tradeRepo.withTransaction(async (client) => {
        await this.tradeRepo.updateProposalStatus(client, tradeId, 'review', { reviewExpiresAt: expiresAt });
        const updated = await this.tradeRepo.findProposalById(tradeId);
        this.gateway?.broadcastToLeague(trade.leagueId, 'trade:accepted', { trade: updated!.toSafeObject() });
        return updated!;
      });
    }

    // Execute immediately
    return this.executeTrade(tradeId);
  }

  async executeTrade(tradeId: string): Promise<TradeProposal> {
    const trade = await this.tradeRepo.findProposalById(tradeId);
    if (!trade) throw new NotFoundException('Trade not found');
    if (trade.status !== 'pending' && trade.status !== 'review' && trade.status !== 'accepted') {
      throw new ValidationException('Trade cannot be executed in current status');
    }

    const proposerRoster = await this.leagueRepo.findRosterByOwner(trade.leagueId, trade.proposedBy);
    const receiverRoster = await this.leagueRepo.findRosterByOwner(trade.leagueId, trade.proposedTo);
    if (!proposerRoster || !receiverRoster) throw new ValidationException('Both users must own a roster');

    // Validate roster sizes after trade
    const league = await this.leagueRepo.findById(trade.leagueId);
    if (league) {
      const maxRosterSize = league.rosterPositions.length;
      let proposerDelta = 0;
      let receiverDelta = 0;
      for (const item of trade.items) {
        if (item.itemType === 'player') {
          if (item.side === 'proposer') { proposerDelta--; receiverDelta++; }
          else { receiverDelta--; proposerDelta++; }
        }
      }
      if (proposerRoster.players.length + proposerDelta > maxRosterSize) {
        throw new ValidationException('Trade would exceed roster size limit for proposer');
      }
      if (receiverRoster.players.length + receiverDelta > maxRosterSize) {
        throw new ValidationException('Trade would exceed roster size limit for receiver');
      }
    }

    return this.tradeRepo.withTransaction(async (client) => {
      const adds: Record<string, number> = {};
      const drops: Record<string, number> = {};
      const playerIds: string[] = [];
      const rosterIds = [proposerRoster.rosterId, receiverRoster.rosterId];
      const draftPickIds: string[] = [];

      for (const item of trade.items) {
        if (item.itemType === 'player' && item.playerId) {
          playerIds.push(item.playerId);

          if (item.side === 'proposer') {
            // Proposer gives player -> remove from proposer, add to receiver
            await client.query(
              'UPDATE rosters SET players = array_remove(players, $1) WHERE league_id = $2 AND owner_id = $3',
              [item.playerId, trade.leagueId, trade.proposedBy],
            );
            await client.query(
              'UPDATE rosters SET players = array_append(players, $1) WHERE league_id = $2 AND owner_id = $3',
              [item.playerId, trade.leagueId, trade.proposedTo],
            );
            drops[item.playerId] = proposerRoster.rosterId;
            adds[item.playerId] = receiverRoster.rosterId;
          } else {
            // Receiver gives player -> remove from receiver, add to proposer
            await client.query(
              'UPDATE rosters SET players = array_remove(players, $1) WHERE league_id = $2 AND owner_id = $3',
              [item.playerId, trade.leagueId, trade.proposedTo],
            );
            await client.query(
              'UPDATE rosters SET players = array_append(players, $1) WHERE league_id = $2 AND owner_id = $3',
              [item.playerId, trade.leagueId, trade.proposedBy],
            );
            drops[item.playerId] = receiverRoster.rosterId;
            adds[item.playerId] = proposerRoster.rosterId;
          }
        }

        if (item.itemType === 'draft_pick' && item.draftPickId) {
          draftPickIds.push(item.draftPickId);
          const newOwner = item.side === 'proposer' ? trade.proposedTo : trade.proposedBy;
          const newRoster = item.side === 'proposer' ? receiverRoster.rosterId : proposerRoster.rosterId;
          await this.tradeRepo.transferDraftPick(client, item.draftPickId, newOwner, newRoster);
        }

        if (item.itemType === 'faab' && item.faabAmount) {
          const sender = item.side === 'proposer' ? trade.proposedBy : trade.proposedTo;
          const receiver = item.side === 'proposer' ? trade.proposedTo : trade.proposedBy;

          const deductResult = await client.query(
            'UPDATE rosters SET waiver_budget = waiver_budget - $1 WHERE league_id = $2 AND owner_id = $3 AND waiver_budget >= $1',
            [item.faabAmount, trade.leagueId, sender],
          );
          if ((deductResult.rowCount ?? 0) === 0) {
            throw new ValidationException('Insufficient FAAB budget for trade');
          }
          await client.query(
            'UPDATE rosters SET waiver_budget = waiver_budget + $1 WHERE league_id = $2 AND owner_id = $3',
            [item.faabAmount, trade.leagueId, receiver],
          );
        }
      }

      // Create transaction record
      const txResult = await client.query(
        `INSERT INTO transactions (league_id, type, status, roster_ids, player_ids, adds, drops, draft_pick_ids, created_by)
         VALUES ($1, 'trade', 'complete', $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [trade.leagueId, rosterIds, playerIds, JSON.stringify(adds), JSON.stringify(drops), draftPickIds, trade.proposedBy],
      );

      await this.tradeRepo.updateProposalStatus(client, tradeId, 'completed', {
        transactionId: txResult.rows[0].id,
      });

      const completed = await this.tradeRepo.findProposalById(tradeId);
      this.gateway?.broadcastToLeague(trade.leagueId, 'trade:completed', { trade: completed!.toSafeObject() });
      this.gateway?.broadcastToLeague(trade.leagueId, 'roster:updated', { league_id: trade.leagueId });

      return completed!;
    });
  }

  async declineTrade(tradeId: string, userId: string): Promise<TradeProposal> {
    const trade = await this.tradeRepo.findProposalById(tradeId);
    if (!trade) throw new NotFoundException('Trade not found');
    if (trade.proposedTo !== userId) throw new ForbiddenException('Only the receiver can decline this trade');
    if (trade.status !== 'pending') throw new ValidationException('Trade is not in pending status');

    return this.tradeRepo.withTransaction(async (client) => {
      await this.tradeRepo.updateProposalStatus(client, tradeId, 'declined');
      const updated = await this.tradeRepo.findProposalById(tradeId);
      this.gateway?.broadcastToLeague(trade.leagueId, 'trade:declined', { trade: updated!.toSafeObject() });
      return updated!;
    });
  }

  async withdrawTrade(tradeId: string, userId: string): Promise<TradeProposal> {
    const trade = await this.tradeRepo.findProposalById(tradeId);
    if (!trade) throw new NotFoundException('Trade not found');
    if (trade.proposedBy !== userId) throw new ForbiddenException('Only the proposer can withdraw this trade');
    if (trade.status !== 'pending') throw new ValidationException('Trade is not in pending status');

    return this.tradeRepo.withTransaction(async (client) => {
      await this.tradeRepo.updateProposalStatus(client, tradeId, 'withdrawn');
      const updated = await this.tradeRepo.findProposalById(tradeId);
      return updated!;
    });
  }

  async counterTrade(
    tradeId: string,
    userId: string,
    request: {
      message?: string;
      items: Array<{
        side: string;
        item_type: string;
        player_id?: string;
        draft_pick_id?: string;
        faab_amount?: number;
        roster_id: number;
      }>;
    },
  ): Promise<TradeProposal> {
    const original = await this.tradeRepo.findProposalById(tradeId);
    if (!original) throw new NotFoundException('Trade not found');
    if (original.proposedTo !== userId) throw new ForbiddenException('Only the receiver can counter this trade');
    if (original.status !== 'pending') throw new ValidationException('Trade is not in pending status');

    // Validate player ownership (counter swaps proposer/receiver)
    const counterProposerRoster = await this.leagueRepo.findRosterByOwner(original.leagueId, userId);
    const counterReceiverRoster = await this.leagueRepo.findRosterByOwner(original.leagueId, original.proposedBy);
    if (!counterProposerRoster || !counterReceiverRoster) throw new ValidationException('Both users must own a roster');

    for (const item of request.items) {
      if (item.item_type === 'player' && item.player_id) {
        const roster = item.side === 'proposer' ? counterProposerRoster : counterReceiverRoster;
        if (!roster.players.includes(item.player_id)) {
          throw new ValidationException(`Player ${item.player_id} is not on the expected roster`);
        }
      }
    }

    return this.tradeRepo.withTransaction(async (client) => {
      // Mark original as countered
      await this.tradeRepo.updateProposalStatus(client, tradeId, 'countered');

      // Create new counter-proposal (swap proposer/receiver)
      const counter = await this.tradeRepo.createProposal(client, {
        leagueId: original.leagueId,
        proposedBy: userId,
        proposedTo: original.proposedBy,
        message: request.message,
      });

      await this.tradeRepo.createItems(client, counter.id, request.items);

      const counterTrade = await this.tradeRepo.findProposalById(counter.id);
      this.gateway?.broadcastToLeague(original.leagueId, 'trade:countered', { trade: counterTrade!.toSafeObject() });
      this.gateway?.broadcastToUser(original.proposedBy, 'trade:countered', { trade: counterTrade!.toSafeObject() });

      return counterTrade!;
    });
  }

  async vetoTrade(tradeId: string, userId: string): Promise<TradeProposal> {
    const trade = await this.tradeRepo.findProposalById(tradeId);
    if (!trade) throw new NotFoundException('Trade not found');

    // Verify commissioner
    const member = await this.leagueRepo.findMember(trade.leagueId, userId);
    if (!member || member.role !== 'commissioner') {
      throw new ForbiddenException('Only the commissioner can veto trades');
    }

    if (trade.status !== 'review' && trade.status !== 'pending') {
      throw new ValidationException('Trade cannot be vetoed in current status');
    }

    return this.tradeRepo.withTransaction(async (client) => {
      await this.tradeRepo.updateProposalStatus(client, tradeId, 'vetoed');
      const updated = await this.tradeRepo.findProposalById(tradeId);
      this.gateway?.broadcastToLeague(trade.leagueId, 'trade:vetoed', { trade: updated!.toSafeObject() });
      return updated!;
    });
  }

  async pushTrade(tradeId: string, userId: string): Promise<TradeProposal> {
    const trade = await this.tradeRepo.findProposalById(tradeId);
    if (!trade) throw new NotFoundException('Trade not found');

    const member = await this.leagueRepo.findMember(trade.leagueId, userId);
    if (!member || member.role !== 'commissioner') {
      throw new ForbiddenException('Only the commissioner can push trades through');
    }

    if (trade.status !== 'review') {
      throw new ValidationException('Only trades in review can be pushed through');
    }

    return this.executeTrade(tradeId);
  }

  async completeExpiredReviews(): Promise<void> {
    const expired = await this.tradeRepo.findExpiredReviews();
    for (const trade of expired) {
      try {
        await this.executeTrade(trade.id);
      } catch (err) {
        console.error(`[TradeService] Failed to execute expired trade ${trade.id}:`, err);
      }
    }
  }

  async getTradeById(tradeId: string, userId: string): Promise<TradeProposal> {
    const trade = await this.tradeRepo.findProposalById(tradeId);
    if (!trade) throw new NotFoundException('Trade not found');

    // Verify league membership
    const member = await this.leagueRepo.findMember(trade.leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    return trade;
  }

  async getLeagueTrades(leagueId: string, userId: string, status?: string): Promise<TradeProposal[]> {
    const member = await this.leagueRepo.findMember(leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    return this.tradeRepo.findProposalsByLeague(leagueId, status);
  }

  async getFuturePicks(leagueId: string, userId: string): Promise<FutureDraftPick[]> {
    const member = await this.leagueRepo.findMember(leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    return this.tradeRepo.findFuturePicksByLeague(leagueId);
  }

  async getUserFuturePicks(leagueId: string, requesterId: string, targetUserId: string): Promise<FutureDraftPick[]> {
    const member = await this.leagueRepo.findMember(leagueId, requesterId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    return this.tradeRepo.findFuturePicksByUser(leagueId, targetUserId);
  }
}
