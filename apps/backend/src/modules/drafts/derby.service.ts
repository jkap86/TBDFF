import { DraftRepository } from './drafts.repository';
import { LeagueRepository } from '../leagues/leagues.repository';
import { DraftGateway } from './draft.gateway';
import { Draft, DerbyState, DerbyPick, DerbyOrderEntry } from './drafts.model';
import {
  ValidationException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '../../shared/exceptions';

export class DerbyService {
  private draftGateway?: DraftGateway;

  constructor(
    private readonly draftRepository: DraftRepository,
    private readonly leagueRepository: LeagueRepository,
  ) {}

  setGateway(gateway: DraftGateway): void {
    this.draftGateway = gateway;
  }

  async startDerby(draftId: string, userId: string): Promise<Draft> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');

    // Only commissioners can start a derby
    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member || member.role !== 'commissioner') {
      throw new ForbiddenException('Only commissioners can start a derby');
    }

    if (draft.status !== 'pre_draft') {
      throw new ValidationException('Can only start a derby before the draft starts');
    }

    // Fetch assigned rosters
    const rosters = await this.leagueRepository.findRostersByLeagueId(draft.leagueId);
    const assignedRosters = rosters.filter((r) => r.ownerId);

    if (assignedRosters.length < 2) {
      throw new ValidationException('At least 2 rosters must have assigned owners to start a derby');
    }

    // Fetch league members for usernames
    const members = await this.leagueRepository.findMembersByLeagueId(draft.leagueId);
    const usernameMap = new Map(members.map((m) => [m.userId, m.username]));

    // Build derby order entries from assigned rosters
    const entries: DerbyOrderEntry[] = assignedRosters.map((r) => ({
      user_id: r.ownerId!,
      roster_id: r.rosterId,
      username: usernameMap.get(r.ownerId!) ?? 'Unknown',
    }));

    // Fisher-Yates shuffle
    const shuffled = this.shuffle(entries);

    const now = new Date();
    const pickTimer = draft.settings.derby_timer ?? draft.settings.pick_timer;
    const timeoutAction = draft.settings.derby_timeout_action ?? 0;

    const derbyState: DerbyState = {
      status: 'active',
      derby_order: shuffled,
      picks: [],
      current_pick_index: 0,
      pick_timer: pickTimer,
      pick_deadline: new Date(now.getTime() + pickTimer * 1000).toISOString(),
      started_at: now.toISOString(),
      skipped_users: [],
      timeout_action: timeoutAction,
    };

    const updated = await this.draftRepository.update(draftId, {
      draftOrder: {},
      slotToRosterId: {},
      metadata: { ...draft.metadata, derby: derbyState },
    });
    if (!updated) throw new NotFoundException('Draft not found');

    this.draftGateway?.broadcast(draftId, 'draft:state_updated', {
      draft: updated,
      server_time: new Date().toISOString(),
    });

    return updated;
  }

  async getDerbyState(draftId: string, userId: string): Promise<DerbyState | null> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');

    // Verify membership
    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    return (draft.metadata?.derby as DerbyState) ?? null;
  }

  async makeDerbyPick(draftId: string, userId: string, slot: number): Promise<Draft> {
    // Light pre-checks outside transaction
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');

    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    const derby = draft.metadata?.derby as DerbyState | undefined;
    if (!derby || derby.status !== 'active') {
      throw new ValidationException('No active derby');
    }

    // All mutation under advisory lock
    const updated = await this.draftRepository.withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [draftId]);

      const freshDraft = await this.draftRepository.findById(draftId, client);
      if (!freshDraft) throw new NotFoundException('Draft not found');

      const freshDerby = freshDraft.metadata?.derby as DerbyState | undefined;
      if (!freshDerby || freshDerby.status !== 'active') {
        throw new ValidationException('Derby is no longer active');
      }

      return this.executePick(freshDraft, freshDerby, userId, member.role === 'commissioner', slot, client);
    });

    if (!updated) throw new NotFoundException('Draft not found');

    this.draftGateway?.broadcast(draftId, 'draft:state_updated', {
      draft: updated,
      server_time: new Date().toISOString(),
    });

    return updated;
  }

  async autoPick(draftId: string, userId: string): Promise<Draft> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');

    const member = await this.leagueRepository.findMember(draft.leagueId, userId);
    if (!member) throw new ForbiddenException('You are not a member of this league');

    const isCommissioner = member.role === 'commissioner';

    // All mutation under advisory lock
    const updated = await this.draftRepository.withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [draftId]);

      const freshDraft = await this.draftRepository.findById(draftId, client);
      if (!freshDraft) throw new NotFoundException('Draft not found');

      const freshDerby = freshDraft.metadata?.derby as DerbyState | undefined;
      if (!freshDerby || freshDerby.status !== 'active') {
        throw new ValidationException('No active derby');
      }

      // Validate timer has expired (commissioners bypass)
      if (!isCommissioner) {
        const deadline = new Date(freshDerby.pick_deadline).getTime();
        if (Date.now() < deadline) {
          throw new ValidationException('Derby pick timer has not expired yet');
        }
      }

      const currentPicker = freshDerby.derby_order[freshDerby.current_pick_index];
      if (!currentPicker) {
        throw new ValidationException('No more picks remaining in the derby');
      }

      // Check timeout action: skip or autopick
      if ((freshDerby.timeout_action ?? 0) === 1) {
        // Skip: add current picker to skipped list and advance turn
        return this.executeSkip(freshDraft, freshDerby, client);
      }

      // Autopick: pick random remaining slot
      const totalSlots = freshDerby.derby_order.length;
      const takenSlots = new Set(freshDerby.picks.map((p) => p.selected_slot));
      const availableSlots: number[] = [];
      for (let i = 1; i <= totalSlots; i++) {
        if (!takenSlots.has(i)) availableSlots.push(i);
      }

      if (availableSlots.length === 0) {
        throw new ValidationException('No available slots remaining');
      }

      const randomSlot = availableSlots[Math.floor(Math.random() * availableSlots.length)];

      return this.executePick(freshDraft, freshDerby, userId, true, randomSlot, client);
    });

    if (!updated) throw new NotFoundException('Draft not found');

    this.draftGateway?.broadcast(draftId, 'draft:state_updated', {
      draft: updated,
      server_time: new Date().toISOString(),
    });

    return updated;
  }

  private async executeSkip(
    draft: Draft,
    derby: DerbyState,
    client: any,
  ): Promise<Draft> {
    const currentPicker = derby.derby_order[derby.current_pick_index];
    const skippedUsers = derby.skipped_users ?? [];

    // Add user to skipped list if not already there
    const newSkippedUsers = skippedUsers.includes(currentPicker.user_id)
      ? [...skippedUsers]
      : [...skippedUsers, currentPicker.user_id];

    const newIndex = derby.current_pick_index + 1;
    const totalSlots = derby.derby_order.length;

    // If we've passed all turns and there are still skipped users, stay active with no timer
    const pastAllTurns = newIndex >= totalSlots;
    const isComplete = pastAllTurns && newSkippedUsers.length === 0;

    const updatedDerby: DerbyState = {
      ...derby,
      current_pick_index: newIndex,
      skipped_users: newSkippedUsers,
      status: isComplete ? 'complete' : 'active',
      pick_deadline: isComplete || pastAllTurns
        ? derby.pick_deadline // No timer when waiting for skipped users
        : new Date(Date.now() + derby.pick_timer * 1000).toISOString(),
    };

    const updated = await this.draftRepository.update(draft.id, {
      metadata: { ...draft.metadata, derby: updatedDerby },
    }, client);
    if (!updated) throw new NotFoundException('Draft not found');

    return updated;
  }

  // ---- Private helpers ----

  private async executePick(
    draft: Draft,
    derby: DerbyState,
    userId: string,
    isCommissioner: boolean,
    slot: number,
    client: any,
  ): Promise<Draft> {
    const totalSlots = derby.derby_order.length;
    const currentPicker = derby.derby_order[derby.current_pick_index];
    const skippedUsers = derby.skipped_users ?? [];
    const isSkippedUser = skippedUsers.includes(userId);

    // Determine who is picking
    let pickingEntry: DerbyOrderEntry;

    if (isSkippedUser) {
      // Skipped user picking out of turn
      const entry = derby.derby_order.find((e) => e.user_id === userId);
      if (!entry) throw new ForbiddenException('User not in derby');
      if (derby.picks.some((p) => p.user_id === userId)) {
        throw new ConflictException('You have already made your derby pick');
      }
      pickingEntry = entry;
    } else if (currentPicker && (isCommissioner || currentPicker.user_id === userId)) {
      pickingEntry = currentPicker;
    } else {
      throw new ForbiddenException('It is not your turn to pick');
    }

    // Slot range validation
    if (slot < 1 || slot > totalSlots) {
      throw new ValidationException(`Slot must be between 1 and ${totalSlots}`);
    }

    // Slot uniqueness validation
    if (derby.picks.some((p) => p.selected_slot === slot)) {
      throw new ConflictException('That draft slot has already been taken');
    }

    const pick: DerbyPick = {
      user_id: pickingEntry.user_id,
      roster_id: pickingEntry.roster_id,
      selected_slot: slot,
      picked_at: new Date().toISOString(),
    };

    const newPicks = [...derby.picks, pick];

    // Remove from skipped list if they were skipped
    const newSkippedUsers = skippedUsers.filter((id) => id !== pickingEntry.user_id);

    // Advance index only for normal turn picks (not skipped user picks)
    let newIndex = derby.current_pick_index;
    if (!isSkippedUser) {
      newIndex = derby.current_pick_index + 1;
    }

    // Derby complete when all users have picked, or all turns exhausted with no skipped remaining
    const allPicked = newPicks.length >= totalSlots;
    const pastAllTurns = newIndex >= totalSlots && newSkippedUsers.length === 0;
    const isComplete = allPicked || pastAllTurns;

    const updatedDerby: DerbyState = {
      ...derby,
      picks: newPicks,
      current_pick_index: newIndex,
      skipped_users: newSkippedUsers,
      status: isComplete ? 'complete' : 'active',
      pick_deadline: isComplete
        ? derby.pick_deadline
        : isSkippedUser
          ? derby.pick_deadline // Don't reset timer when a skipped user picks
          : new Date(Date.now() + derby.pick_timer * 1000).toISOString(),
    };

    const updateData: Record<string, any> = {
      metadata: { ...draft.metadata, derby: updatedDerby },
    };

    // On completion, set draft order from derby picks
    if (isComplete) {
      const draftOrder: Record<string, number> = {};
      const slotToRosterId: Record<string, number> = {};
      for (const p of newPicks) {
        draftOrder[p.user_id] = p.selected_slot;
        slotToRosterId[String(p.selected_slot)] = p.roster_id;
      }
      updateData.draftOrder = draftOrder;
      updateData.slotToRosterId = slotToRosterId;
    }

    const updated = await this.draftRepository.update(draft.id, updateData, client);
    if (!updated) throw new NotFoundException('Draft not found');

    return updated;
  }

  private shuffle<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
