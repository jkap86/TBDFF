import { DraftRepository } from './drafts.repository';
import { LeagueRepository } from '../leagues/leagues.repository';
import { DraftGateway } from './draft.gateway';
import { Draft, DraftPick } from './drafts.model';
import {
  ValidationException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '../../shared/exceptions';
import { findUserByRosterId, findRosterIdByUserId } from './draft-helpers';

export class AutoPickService {
  /** Per-draft lock to prevent concurrent processAutoPickChain executions */
  private autoPickChainLocks = new Map<string, Promise<DraftPick[]>>();
  private draftGateway?: DraftGateway;

  /** Callback invoked after vet draft completion to set up rookie draft */
  private onVetDraftCompleted?: (completedDraft: Draft) => Promise<void>;

  constructor(
    private readonly draftRepository: DraftRepository,
    private readonly leagueRepository: LeagueRepository,
  ) {}

  setGateway(gateway: DraftGateway): void {
    this.draftGateway = gateway;
  }

  /** Register a callback for when a vet draft completes (used by DraftService for rookie draft setup) */
  setOnVetDraftCompleted(callback: (completedDraft: Draft) => Promise<void>): void {
    this.onVetDraftCompleted = callback;
  }

  async autoPick(
    draftId: string,
    userId: string,
  ): Promise<{ pick: DraftPick; chainedPicks: DraftPick[] }> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');

    if (draft.status !== 'drafting') {
      throw new ValidationException('Draft is not currently active');
    }

    const autoPickClockState = draft.metadata?.clock_state ?? 'running';
    if (autoPickClockState === 'paused' || autoPickClockState === 'stopped') {
      throw new ValidationException('Draft is paused or stopped by commissioner');
    }

    if (draft.type === 'auction' || draft.type === 'slow_auction') {
      throw new ValidationException('Use the nominate/bid endpoints for auction drafts');
    }

    // Verify membership
    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    // Find the next pick
    const nextPick = await this.draftRepository.findNextPick(draftId);
    if (!nextPick) {
      throw new ValidationException('All picks have been made');
    }

    // Check timer has expired OR user is commissioner
    const isCommissioner = member.role === 'commissioner';
    const referenceTime = draft.lastPicked || draft.startTime;
    if (referenceTime && !isCommissioner) {
      const deadline = new Date(referenceTime).getTime() + draft.settings.pick_timer * 1000;
      if (Date.now() < deadline) {
        throw new ValidationException('Pick timer has not expired yet');
      }
    }

    // Determine the user who owns the current pick's roster (accounts for trades)
    const pickOwner = findUserByRosterId(draft.draftOrder, draft.slotToRosterId, nextPick.rosterId);
    if (!pickOwner) {
      throw new ValidationException('Could not determine pick owner for auto-pick');
    }

    // Try the user's queue first, fall back to best available
    const playerType = draft.settings.player_type;
    console.log(`[auto-pick] draft=${draftId} slot=${nextPick.draftSlot} rosterId=${nextPick.rosterId} pickOwner=${pickOwner} triggeredBy=${userId}`);
    const queuedPlayer = await this.draftRepository.findFirstAvailableFromQueue(draftId, pickOwner, undefined, playerType);
    console.log(`[auto-pick] queueResult=${queuedPlayer ? `${queuedPlayer.fullName} (${queuedPlayer.id})` : 'null (no queued player)'}`);

    // Check for queued rookie pick (rpick: IDs aren't in the players table)
    let rookiePickId: string | null = null;
    if (!queuedPlayer && draft.settings.include_rookie_picks) {
      rookiePickId = await this.draftRepository.findFirstRookiePickFromQueue(draftId, pickOwner);
    }

    let pick: DraftPick;

    if (rookiePickId) {
      // Rookie pick from queue — build metadata same as makePick()
      const parts = rookiePickId.split(':');
      const rpRound = parseInt(parts[1], 10);
      const rpPick = parseInt(parts[2], 10);
      const pickLabel = `${rpRound}.${String(rpPick).padStart(2, '0')}`;
      const pickMetadata = {
        rookie_pick: true,
        first_name: 'Rookie Pick',
        last_name: pickLabel,
        full_name: `Rookie Pick ${pickLabel}`,
        position: 'PICK',
        team: null,
        auto_pick: true,
      };
      console.log(`[auto-pick] finalPick=${pickLabel} source=queue(rpick)`);
      const result = await this.draftRepository.makePick(nextPick.id, rookiePickId, pickOwner, pickMetadata);
      if (!result) throw new ConflictException('Pick was already made');
      pick = result;
    } else {
      const bestPlayer = queuedPlayer ?? (await this.draftRepository.findBestAvailable(draftId, undefined, playerType));
      if (!bestPlayer) {
        throw new ValidationException('No available players to auto-pick');
      }
      console.log(`[auto-pick] finalPick=${bestPlayer.fullName} (${bestPlayer.id}) source=${queuedPlayer ? 'queue' : 'BPA'}`);
      const pickMetadata = {
        first_name: bestPlayer.firstName,
        last_name: bestPlayer.lastName,
        full_name: bestPlayer.fullName,
        position: bestPlayer.position,
        team: bestPlayer.team,
        auto_pick: true,
      };
      const result = await this.draftRepository.makePick(nextPick.id, bestPlayer.id, pickOwner, pickMetadata);
      if (!result) throw new ConflictException('Pick was already made');
      pick = result;
    }

    // Update last_picked timestamp
    await this.draftRepository.update(draftId, {
      lastPicked: new Date().toISOString(),
    });

    // Timeout triggers autopick mode for the timed-out user
    await this.draftRepository.addAutoPickUser(draftId, pickOwner);

    // Atomically complete draft + league in one transaction
    const completed = await this.draftRepository.completeAndUpdateLeague(draftId, draft.leagueId);
    if (completed) {
      await this.onVetDraftCompleted?.(draft);
    }

    // Process auto-pick chain for subsequent autopick users
    const chainedPicks = completed ? [] : await this.scheduleAutoPickChain(draftId);

    const finalDraft = await this.draftRepository.findById(draftId);
    if (finalDraft) {
      this.draftGateway?.broadcast(draftId, 'draft:state_updated', {
        draft: finalDraft,
        pick,
        chained_picks: chainedPicks,
        server_time: new Date().toISOString(),
      });
    }

    return { pick, chainedPicks };
  }

  async toggleAutoPick(
    draftId: string,
    userId: string,
  ): Promise<{ draft: Draft; picks: DraftPick[] }> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');

    if (draft.status !== 'drafting') {
      throw new ValidationException('Draft is not currently active');
    }

    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    const userSlot = draft.draftOrder[userId];
    if (userSlot === undefined) {
      throw new ForbiddenException('You are not assigned a draft slot');
    }

    const autoPickUsers: string[] = draft.metadata?.auto_pick_users ?? [];
    const isCurrentlyOn = autoPickUsers.includes(userId);

    if (isCurrentlyOn) {
      const updatedDraft =
        (await this.draftRepository.removeAutoPickUser(draftId, userId)) ?? draft;
      this.draftGateway?.broadcast(draftId, 'draft:state_updated', { draft: updatedDraft, server_time: new Date().toISOString() });
      return { draft: updatedDraft, picks: [] };
    }

    // Toggle ON
    await this.draftRepository.addAutoPickUser(draftId, userId);

    // If it's currently this user's turn, chain auto-picks starting now
    const chainedPicks = await this.scheduleAutoPickChain(draftId);

    const finalDraft = await this.draftRepository.findById(draftId);
    if (finalDraft) {
      this.draftGateway?.broadcast(draftId, 'draft:state_updated', {
        draft: finalDraft,
        chained_picks: chainedPicks,
        server_time: new Date().toISOString(),
      });
    }
    return { draft: finalDraft ?? draft, picks: chainedPicks };
  }

  /**
   * Serialize processAutoPickChain calls per draft to prevent concurrent
   * auto-pick chains from racing and creating duplicate picks.
   */
  scheduleAutoPickChain(draftId: string): Promise<DraftPick[]> {
    const existing = this.autoPickChainLocks.get(draftId);
    const run = (existing ?? Promise.resolve([] as DraftPick[]))
      .then(() => this.processAutoPickChain(draftId))
      .catch((err) => {
        console.error(`[AutoPickService] autoPickChain failed for draft ${draftId}:`, err);
        return [] as DraftPick[];
      });
    this.autoPickChainLocks.set(draftId, run);
    run.finally(() => {
      if (this.autoPickChainLocks.get(draftId) === run) {
        this.autoPickChainLocks.delete(draftId);
      }
    });
    return run;
  }

  private async processAutoPickChain(draftId: string): Promise<DraftPick[]> {
    const chainedPicks: DraftPick[] = [];
    const MAX_CHAIN = 50;

    for (let i = 0; i < MAX_CHAIN; i++) {
      const draft = await this.draftRepository.findById(draftId);
      if (!draft || draft.status !== 'drafting') break;

      // Stop auto-pick chain when draft is paused or stopped
      const chainClockState = draft.metadata?.clock_state ?? 'running';
      if (chainClockState === 'paused' || chainClockState === 'stopped') break;

      const nextPick = await this.draftRepository.findNextPick(draftId);
      if (!nextPick) break;

      const autoPickUsers: string[] = draft.metadata?.auto_pick_users ?? [];
      const pickOwner = findUserByRosterId(draft.draftOrder, draft.slotToRosterId, nextPick.rosterId);
      if (!pickOwner || !autoPickUsers.includes(pickOwner)) break;

      const chainPlayerType = draft.settings.player_type;
      const queuedPlayer = await this.draftRepository.findFirstAvailableFromQueue(
        draftId,
        pickOwner,
        undefined,
        chainPlayerType,
      );

      // Check for queued rookie pick (rpick: IDs aren't in the players table)
      let rookiePickId: string | null = null;
      if (!queuedPlayer && draft.settings.include_rookie_picks) {
        rookiePickId = await this.draftRepository.findFirstRookiePickFromQueue(draftId, pickOwner);
      }

      let pick: DraftPick | null;

      if (rookiePickId) {
        const parts = rookiePickId.split(':');
        const rpRound = parseInt(parts[1], 10);
        const rpPick = parseInt(parts[2], 10);
        const pickLabel = `${rpRound}.${String(rpPick).padStart(2, '0')}`;
        pick = await this.draftRepository.makePick(nextPick.id, rookiePickId, pickOwner, {
          rookie_pick: true,
          first_name: 'Rookie Pick',
          last_name: pickLabel,
          full_name: `Rookie Pick ${pickLabel}`,
          position: 'PICK',
          team: null,
          auto_pick: true,
        });
      } else {
        const bestPlayer = queuedPlayer ?? (await this.draftRepository.findBestAvailable(draftId, undefined, chainPlayerType));
        if (!bestPlayer) break;

        pick = await this.draftRepository.makePick(nextPick.id, bestPlayer.id, pickOwner, {
          first_name: bestPlayer.firstName,
          last_name: bestPlayer.lastName,
          full_name: bestPlayer.fullName,
          position: bestPlayer.position,
          team: bestPlayer.team,
          auto_pick: true,
        });
      }

      if (!pick) break;

      await this.draftRepository.update(draftId, {
        lastPicked: new Date().toISOString(),
      });

      chainedPicks.push(pick);

      const completed = await this.draftRepository.completeAndUpdateLeague(draftId, draft.leagueId);
      if (completed) {
        await this.onVetDraftCompleted?.(draft);
        break;
      }
    }

    // If we hit the batch limit, schedule a server-side continuation so we
    // don't rely on clients to trigger the next batch of auto-picks.
    if (chainedPicks.length >= MAX_CHAIN) {
      setImmediate(() => {
        this.continueAutoPickChain(draftId).catch((err) => {
          console.error(`[AutoPickService] auto-pick continuation failed for draft ${draftId}:`, err);
        });
      });
    }

    return chainedPicks;
  }

  /**
   * Continue processing auto-picks after a chain hit MAX_CHAIN.
   * Broadcasts its own results so clients stay updated.
   */
  private async continueAutoPickChain(draftId: string): Promise<void> {
    const chainedPicks = await this.scheduleAutoPickChain(draftId);
    if (chainedPicks.length > 0) {
      const draft = await this.draftRepository.findById(draftId);
      if (draft && draft.status === 'drafting') {
        this.draftGateway?.broadcast(draftId, 'draft:state_updated', {
          draft,
          chained_picks: chainedPicks,
          server_time: new Date().toISOString(),
        });
      }
    }
  }
}
