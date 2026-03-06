import { TradeRepository } from './trades.repository';
import { TradeProposal, FutureDraftPick } from './trades.model';
import { LeagueRepository } from '../leagues/leagues.repository';
import { LeagueMembersRepository } from '../leagues/league-members.repository';
import { LeagueRostersRepository } from '../leagues/league-rosters.repository';
import { DraftRepository } from '../drafts/drafts.repository';
import { PlayerRepository } from '../players/players.repository';
import { TransactionsGateway } from '../transactions/transactions.gateway';
import { SystemMessageService } from '../chat/system-message.service';
import {
  NotFoundException,
  ForbiddenException,
  ValidationException,
  ConflictException,
} from '../../shared/exceptions';

export class TradeService {
  private gateway: TransactionsGateway | null = null;
  private systemMessages: SystemMessageService | null = null;

  constructor(
    private readonly tradeRepo: TradeRepository,
    private readonly leagueRepo: LeagueRepository,
    private readonly leagueMembersRepo: LeagueMembersRepository,
    private readonly leagueRostersRepo: LeagueRostersRepository,
    private readonly draftRepo: DraftRepository,
    private readonly playerRepo: PlayerRepository,
  ) {}

  setGateway(gw: TransactionsGateway): void {
    this.gateway = gw;
  }

  setSystemMessages(sms: SystemMessageService): void {
    this.systemMessages = sms;
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
    const member = await this.leagueMembersRepo.findMember(leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    const receiver = await this.leagueMembersRepo.findMember(leagueId, request.proposed_to);
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
    const proposerRoster = await this.leagueRostersRepo.findRosterByOwner(leagueId, userId);
    const receiverRoster = await this.leagueRostersRepo.findRosterByOwner(leagueId, request.proposed_to);
    if (!proposerRoster || !receiverRoster) throw new ValidationException('Both users must own a roster');

    // Reject duplicates and mismatched roster ids before any persistence
    validateTradeItems(request.items, proposerRoster.rosterId, receiverRoster.rosterId);

    for (const item of request.items) {
      if (item.item_type === 'player' && item.player_id) {
        const roster = item.side === 'proposer' ? proposerRoster : receiverRoster;
        if (!roster.players.includes(item.player_id)) {
          throw new ValidationException(`Player ${item.player_id} is not on the expected roster`);
        }
      }
      if (item.item_type === 'draft_pick' && item.draft_pick_id) {
        const pick = await this.tradeRepo.findFuturePickById(item.draft_pick_id);
        if (!pick) throw new ValidationException('Draft pick not found');
        const expectedOwner = item.side === 'proposer' ? userId : request.proposed_to;
        if (pick.currentOwnerId !== expectedOwner) {
          throw new ValidationException('Draft pick is not owned by the expected user');
        }
        const complete = await this.tradeRepo.isDraftCompleteForPick(item.draft_pick_id);
        if (complete) throw new ValidationException('Cannot trade a pick for a draft that has already completed');
      }
    }

    const trade = await this.tradeRepo.withTransaction(async (client) => {
      const proposal = await this.tradeRepo.createProposal(client, {
        leagueId,
        proposedBy: userId,
        proposedTo: request.proposed_to,
        message: request.message,
      });

      await this.tradeRepo.createItems(client, proposal.id, request.items);

      return this.tradeRepo.findProposalById(proposal.id, client);
    });

    // Post-commit broadcasts
    this.gateway?.broadcastToLeague(leagueId, 'trade:proposed', { trade: trade!.toSafeObject() });
    this.gateway?.broadcastToUser(request.proposed_to, 'trade:proposed', { trade: trade!.toSafeObject() });

    return trade!;
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

      const updated = await this.tradeRepo.withTransaction(async (client) => {
        const locked = await this.tradeRepo.findProposalByIdForUpdate(tradeId, client);
        if (!locked) throw new NotFoundException('Trade not found');
        if (locked.proposedTo !== userId) throw new ForbiddenException('Only the receiver can accept this trade');
        if (locked.status !== 'pending') throw new ConflictException('Trade is no longer in a valid state for this action');

        const changed = await this.tradeRepo.updateProposalStatusIfCurrent(client, tradeId, 'review', ['pending'], { reviewExpiresAt: expiresAt });
        if (!changed) throw new ConflictException('Trade is no longer in a valid state for this action');

        return this.tradeRepo.findProposalById(tradeId, client);
      });

      // Post-commit broadcast
      this.gateway?.broadcastToLeague(trade.leagueId, 'trade:accepted', { trade: updated!.toSafeObject() });
      return updated!;
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

    const proposerRoster = await this.leagueRostersRepo.findRosterByOwner(trade.leagueId, trade.proposedBy);
    const receiverRoster = await this.leagueRostersRepo.findRosterByOwner(trade.leagueId, trade.proposedTo);
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

    const completed = await this.tradeRepo.withTransaction(async (client) => {
      // Lock the proposal row and re-validate status
      const locked = await this.tradeRepo.findProposalByIdForUpdate(tradeId, client);
      if (!locked) throw new NotFoundException('Trade not found');
      if (locked.status !== 'pending' && locked.status !== 'review' && locked.status !== 'accepted') {
        throw new ConflictException('Trade is no longer in a valid state for this action');
      }

      // Lock both roster rows to prevent concurrent modifications (trades, waivers, add/drops)
      await client.query(
        'SELECT id FROM rosters WHERE league_id = $1 AND owner_id IN ($2, $3) ORDER BY id FOR UPDATE',
        [trade.leagueId, trade.proposedBy, trade.proposedTo],
      );

      // Re-validate player ownership under lock
      const lockedProposerResult = await client.query(
        'SELECT players FROM rosters WHERE league_id = $1 AND owner_id = $2',
        [trade.leagueId, trade.proposedBy],
      );
      const lockedReceiverResult = await client.query(
        'SELECT players FROM rosters WHERE league_id = $1 AND owner_id = $2',
        [trade.leagueId, trade.proposedTo],
      );
      if (!lockedProposerResult.rows[0] || !lockedReceiverResult.rows[0]) {
        throw new ValidationException('Both users must still own a roster');
      }
      const lockedProposerPlayers: string[] = lockedProposerResult.rows[0].players ?? [];
      const lockedReceiverPlayers: string[] = lockedReceiverResult.rows[0].players ?? [];

      for (const item of trade.items) {
        if (item.itemType === 'player' && item.playerId) {
          const players = item.side === 'proposer' ? lockedProposerPlayers : lockedReceiverPlayers;
          if (!players.includes(item.playerId)) {
            throw new ValidationException(`Player ${item.playerId} is no longer on the expected roster`);
          }
        }
        if (item.itemType === 'draft_pick' && item.draftPickId) {
          // Lock the future pick row and re-validate ownership
          const lockResult = await client.query(
            'SELECT current_owner_id FROM future_draft_picks WHERE id = $1 FOR UPDATE',
            [item.draftPickId],
          );
          if (lockResult.rows.length === 0) {
            throw new ValidationException('Draft pick no longer exists');
          }
          const expectedOwner = item.side === 'proposer' ? trade.proposedBy : trade.proposedTo;
          if (lockResult.rows[0].current_owner_id !== expectedOwner) {
            throw new ValidationException('Draft pick ownership has changed since trade was proposed');
          }
        }
      }

      // Re-check roster-size constraints against locked state
      if (league) {
        const maxRosterSize = league.rosterPositions.length;
        let lockedProposerDelta = 0;
        let lockedReceiverDelta = 0;
        for (const item of trade.items) {
          if (item.itemType === 'player') {
            if (item.side === 'proposer') { lockedProposerDelta--; lockedReceiverDelta++; }
            else { lockedReceiverDelta--; lockedProposerDelta++; }
          }
        }
        if (lockedProposerPlayers.length + lockedProposerDelta > maxRosterSize) {
          throw new ValidationException('Trade would exceed roster size limit for proposer');
        }
        if (lockedReceiverPlayers.length + lockedReceiverDelta > maxRosterSize) {
          throw new ValidationException('Trade would exceed roster size limit for receiver');
        }
      }

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
              `UPDATE rosters SET
                 players  = array_remove(players, $1),
                 starters = array_remove(starters, $1),
                 reserve  = array_remove(reserve, $1),
                 taxi     = array_remove(taxi, $1)
               WHERE league_id = $2 AND owner_id = $3`,
              [item.playerId, trade.leagueId, trade.proposedBy],
            );
            const addResult = await client.query(
              'UPDATE rosters SET players = array_append(players, $1) WHERE league_id = $2 AND owner_id = $3 AND NOT ($1 = ANY(players))',
              [item.playerId, trade.leagueId, trade.proposedTo],
            );
            if ((addResult.rowCount ?? 0) === 0) {
              throw new ValidationException(`Player ${item.playerId} is already on the destination roster`);
            }
            drops[item.playerId] = proposerRoster.rosterId;
            adds[item.playerId] = receiverRoster.rosterId;
          } else {
            // Receiver gives player -> remove from receiver, add to proposer
            await client.query(
              `UPDATE rosters SET
                 players  = array_remove(players, $1),
                 starters = array_remove(starters, $1),
                 reserve  = array_remove(reserve, $1),
                 taxi     = array_remove(taxi, $1)
               WHERE league_id = $2 AND owner_id = $3`,
              [item.playerId, trade.leagueId, trade.proposedTo],
            );
            const addResult = await client.query(
              'UPDATE rosters SET players = array_append(players, $1) WHERE league_id = $2 AND owner_id = $3 AND NOT ($1 = ANY(players))',
              [item.playerId, trade.leagueId, trade.proposedBy],
            );
            if ((addResult.rowCount ?? 0) === 0) {
              throw new ValidationException(`Player ${item.playerId} is already on the destination roster`);
            }
            drops[item.playerId] = receiverRoster.rosterId;
            adds[item.playerId] = proposerRoster.rosterId;
          }
        }

        if (item.itemType === 'draft_pick' && item.draftPickId) {
          draftPickIds.push(item.draftPickId);
          const newOwner = item.side === 'proposer' ? trade.proposedTo : trade.proposedBy;
          const newRoster = item.side === 'proposer' ? receiverRoster.rosterId : proposerRoster.rosterId;
          await this.tradeRepo.transferDraftPick(client, item.draftPickId, newOwner, newRoster);
          // If the draft is in progress, also update the corresponding draft_pick
          await this.tradeRepo.transferActiveDraftPicks(client, item.draftPickId, newRoster);
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

      const changed = await this.tradeRepo.updateProposalStatusIfCurrent(
        client, tradeId, 'completed', ['pending', 'review', 'accepted'],
        { transactionId: txResult.rows[0].id },
      );
      if (!changed) throw new ConflictException('Trade is no longer in a valid state for this action');

      return this.tradeRepo.findProposalById(tradeId, client);
    });

    // Post-commit broadcasts
    this.gateway?.broadcastToLeague(trade.leagueId, 'trade:completed', { trade: completed!.toSafeObject() });
    this.gateway?.broadcastToLeague(trade.leagueId, 'roster:updated', { league_id: trade.leagueId });

    // Post-commit system message
    try {
      const playerIds = trade.items
        .filter((i) => i.itemType === 'player' && i.playerId)
        .map((i) => i.playerId!);

      const playerNameMap: Record<string, string> = {};
      if (playerIds.length > 0) {
        const players = await this.playerRepo.findByIds(playerIds);
        for (const p of players) playerNameMap[p.id] = p.fullName;
      }

      const proposerReceives: string[] = [];
      const receiverReceives: string[] = [];
      for (const item of trade.items) {
        if (item.itemType === 'player' && item.playerId) {
          const name = playerNameMap[item.playerId] ?? item.playerId;
          if (item.side === 'proposer') receiverReceives.push(name);
          else proposerReceives.push(name);
        }
        if (item.itemType === 'draft_pick' && item.draftPickId) {
          const pick = await this.tradeRepo.findFuturePickById(item.draftPickId);
          const pickLabel = pick ? `${pick.season} Rd ${pick.round}` : 'Draft Pick';
          if (item.side === 'proposer') receiverReceives.push(pickLabel);
          else proposerReceives.push(pickLabel);
        }
        if (item.itemType === 'faab' && item.faabAmount) {
          const faabLabel = `$${item.faabAmount} FAAB`;
          if (item.side === 'proposer') receiverReceives.push(faabLabel);
          else proposerReceives.push(faabLabel);
        }
      }

      const proposerName = completed!.proposedByUsername ?? 'Team';
      const receiverName = completed!.proposedToUsername ?? 'Team';
      const msg = `Trade completed: ${proposerName} receives ${proposerReceives.join(', ')} — ${receiverName} receives ${receiverReceives.join(', ')}`;
      await this.systemMessages?.send(trade.leagueId, msg, { event: 'trade_executed', trade_id: tradeId });
    } catch { /* non-fatal */ }

    return completed!;
  }

  async declineTrade(tradeId: string, userId: string): Promise<TradeProposal> {
    const trade = await this.tradeRepo.findProposalById(tradeId);
    if (!trade) throw new NotFoundException('Trade not found');
    if (trade.proposedTo !== userId) throw new ForbiddenException('Only the receiver can decline this trade');
    if (trade.status !== 'pending') throw new ValidationException('Trade is not in pending status');

    const updated = await this.tradeRepo.withTransaction(async (client) => {
      const locked = await this.tradeRepo.findProposalByIdForUpdate(tradeId, client);
      if (!locked) throw new NotFoundException('Trade not found');
      if (locked.proposedTo !== userId) throw new ForbiddenException('Only the receiver can decline this trade');
      if (locked.status !== 'pending') throw new ConflictException('Trade is no longer in a valid state for this action');

      const changed = await this.tradeRepo.updateProposalStatusIfCurrent(client, tradeId, 'declined', ['pending']);
      if (!changed) throw new ConflictException('Trade is no longer in a valid state for this action');

      return this.tradeRepo.findProposalById(tradeId, client);
    });

    // Post-commit broadcast
    this.gateway?.broadcastToLeague(trade.leagueId, 'trade:declined', { trade: updated!.toSafeObject() });

    return updated!;
  }

  async withdrawTrade(tradeId: string, userId: string): Promise<TradeProposal> {
    const trade = await this.tradeRepo.findProposalById(tradeId);
    if (!trade) throw new NotFoundException('Trade not found');
    if (trade.proposedBy !== userId) throw new ForbiddenException('Only the proposer can withdraw this trade');
    if (trade.status !== 'pending') throw new ValidationException('Trade is not in pending status');

    const updated = await this.tradeRepo.withTransaction(async (client) => {
      const locked = await this.tradeRepo.findProposalByIdForUpdate(tradeId, client);
      if (!locked) throw new NotFoundException('Trade not found');
      if (locked.proposedBy !== userId) throw new ForbiddenException('Only the proposer can withdraw this trade');
      if (locked.status !== 'pending') throw new ConflictException('Trade is no longer in a valid state for this action');

      const changed = await this.tradeRepo.updateProposalStatusIfCurrent(client, tradeId, 'withdrawn', ['pending']);
      if (!changed) throw new ConflictException('Trade is no longer in a valid state for this action');

      return this.tradeRepo.findProposalById(tradeId, client);
    });

    // Post-commit broadcast
    this.gateway?.broadcastToLeague(trade.leagueId, 'trade:withdrawn', { trade: updated!.toSafeObject() });

    return updated!;
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
    const counterProposerRoster = await this.leagueRostersRepo.findRosterByOwner(original.leagueId, userId);
    const counterReceiverRoster = await this.leagueRostersRepo.findRosterByOwner(original.leagueId, original.proposedBy);
    if (!counterProposerRoster || !counterReceiverRoster) throw new ValidationException('Both users must own a roster');

    // Reject duplicates and mismatched roster ids before any persistence
    validateTradeItems(request.items, counterProposerRoster.rosterId, counterReceiverRoster.rosterId);

    for (const item of request.items) {
      if (item.item_type === 'player' && item.player_id) {
        const roster = item.side === 'proposer' ? counterProposerRoster : counterReceiverRoster;
        if (!roster.players.includes(item.player_id)) {
          throw new ValidationException(`Player ${item.player_id} is not on the expected roster`);
        }
      }
      if (item.item_type === 'draft_pick' && item.draft_pick_id) {
        const pick = await this.tradeRepo.findFuturePickById(item.draft_pick_id);
        if (!pick) throw new ValidationException('Draft pick not found');
        const expectedOwner = item.side === 'proposer' ? userId : original.proposedBy;
        if (pick.currentOwnerId !== expectedOwner) {
          throw new ValidationException('Draft pick is not owned by the expected user');
        }
        const complete = await this.tradeRepo.isDraftCompleteForPick(item.draft_pick_id);
        if (complete) throw new ValidationException('Cannot trade a pick for a draft that has already completed');
      }
    }

    const counterTrade = await this.tradeRepo.withTransaction(async (client) => {
      // Lock and re-validate original proposal
      const locked = await this.tradeRepo.findProposalByIdForUpdate(tradeId, client);
      if (!locked) throw new NotFoundException('Trade not found');
      if (locked.proposedTo !== userId) throw new ForbiddenException('Only the receiver can counter this trade');
      if (locked.status !== 'pending') throw new ConflictException('Trade is no longer in a valid state for this action');

      // Mark original as countered
      const changed = await this.tradeRepo.updateProposalStatusIfCurrent(client, tradeId, 'countered', ['pending']);
      if (!changed) throw new ConflictException('Trade is no longer in a valid state for this action');

      // Create new counter-proposal (swap proposer/receiver)
      const counter = await this.tradeRepo.createProposal(client, {
        leagueId: original.leagueId,
        proposedBy: userId,
        proposedTo: original.proposedBy,
        message: request.message,
      });

      await this.tradeRepo.createItems(client, counter.id, request.items);

      return this.tradeRepo.findProposalById(counter.id, client);
    });

    // Post-commit broadcasts
    this.gateway?.broadcastToLeague(original.leagueId, 'trade:countered', { trade: counterTrade!.toSafeObject() });
    this.gateway?.broadcastToUser(original.proposedBy, 'trade:countered', { trade: counterTrade!.toSafeObject() });

    return counterTrade!;
  }

  async vetoTrade(tradeId: string, userId: string): Promise<TradeProposal> {
    const trade = await this.tradeRepo.findProposalById(tradeId);
    if (!trade) throw new NotFoundException('Trade not found');

    // Verify commissioner
    const member = await this.leagueMembersRepo.findMember(trade.leagueId, userId);
    if (!member || member.role !== 'commissioner') {
      throw new ForbiddenException('Only the commissioner can veto trades');
    }

    if (trade.status !== 'review' && trade.status !== 'pending') {
      throw new ValidationException('Trade cannot be vetoed in current status');
    }

    const updated = await this.tradeRepo.withTransaction(async (client) => {
      const locked = await this.tradeRepo.findProposalByIdForUpdate(tradeId, client);
      if (!locked) throw new NotFoundException('Trade not found');
      if (locked.status !== 'review' && locked.status !== 'pending') {
        throw new ConflictException('Trade is no longer in a valid state for this action');
      }

      const changed = await this.tradeRepo.updateProposalStatusIfCurrent(client, tradeId, 'vetoed', ['review', 'pending']);
      if (!changed) throw new ConflictException('Trade is no longer in a valid state for this action');

      return this.tradeRepo.findProposalById(tradeId, client);
    });

    // Post-commit broadcast
    this.gateway?.broadcastToLeague(trade.leagueId, 'trade:vetoed', { trade: updated!.toSafeObject() });

    return updated!;
  }

  async pushTrade(tradeId: string, userId: string): Promise<TradeProposal> {
    const trade = await this.tradeRepo.findProposalById(tradeId);
    if (!trade) throw new NotFoundException('Trade not found');

    const member = await this.leagueMembersRepo.findMember(trade.leagueId, userId);
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
    const member = await this.leagueMembersRepo.findMember(trade.leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    return trade;
  }

  async getLeagueTrades(leagueId: string, userId: string, status?: string): Promise<TradeProposal[]> {
    const member = await this.leagueMembersRepo.findMember(leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    return this.tradeRepo.findProposalsByLeague(leagueId, status);
  }

  async getFuturePicks(leagueId: string, userId: string): Promise<FutureDraftPick[]> {
    const member = await this.leagueMembersRepo.findMember(leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    const picks = await this.tradeRepo.findFuturePicksByLeague(leagueId);
    return this.enrichPickNumbers(leagueId, picks);
  }

  async getUserFuturePicks(leagueId: string, requesterId: string, targetUserId: string): Promise<FutureDraftPick[]> {
    const member = await this.leagueMembersRepo.findMember(leagueId, requesterId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    const picks = await this.tradeRepo.findFuturePicksByUser(leagueId, targetUserId);
    return this.enrichPickNumbers(leagueId, picks);
  }

  private async enrichPickNumbers(leagueId: string, picks: FutureDraftPick[]): Promise<FutureDraftPick[]> {
    if (picks.length === 0) return picks;

    const draft = await this.draftRepo.findActiveDraftByLeagueId(leagueId);
    if (!draft || Object.keys(draft.draftOrder).length === 0) return picks;

    const teams = draft.settings.teams;

    for (const pick of picks) {
      const slot = draft.draftOrder[pick.originalOwnerId];
      if (slot !== undefined) {
        pick.pickNumber = computePickInRound(slot, pick.round, teams, draft.type);
      }
    }

    return picks;
  }
}

function validateTradeItems(
  items: Array<{ side: string; item_type: string; player_id?: string; draft_pick_id?: string; roster_id: number }>,
  proposerRosterId: number,
  receiverRosterId: number,
): void {
  const seenPlayerIds = new Set<string>();
  const seenDraftPickIds = new Set<string>();

  for (const item of items) {
    if (item.player_id) {
      if (seenPlayerIds.has(item.player_id)) {
        throw new ValidationException(`Duplicate player in trade proposal: ${item.player_id}`);
      }
      seenPlayerIds.add(item.player_id);
    }

    if (item.draft_pick_id) {
      if (seenDraftPickIds.has(item.draft_pick_id)) {
        throw new ValidationException(`Duplicate draft pick in trade proposal: ${item.draft_pick_id}`);
      }
      seenDraftPickIds.add(item.draft_pick_id);
    }

    const expectedRosterId = item.side === 'proposer' ? proposerRosterId : receiverRosterId;
    if (item.roster_id !== expectedRosterId) {
      throw new ValidationException(`Item roster_id does not match the expected roster for ${item.side} side`);
    }
  }
}

function computePickInRound(slot: number, round: number, teams: number, draftType: string): number {
  if (draftType === 'snake') {
    return round % 2 === 1 ? slot : teams - slot + 1;
  } else if (draftType === '3rr') {
    if (round <= 2) {
      return round % 2 === 1 ? slot : teams - slot + 1;
    } else {
      return round % 2 === 0 ? slot : teams - slot + 1;
    }
  }
  return slot; // linear
}
