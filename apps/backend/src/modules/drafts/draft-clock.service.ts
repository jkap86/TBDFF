import { DraftRepository } from './drafts.repository';
import { DraftTimerRepository } from './draft-timer.repository';
import { LeagueRepository } from '../leagues/leagues.repository';
import { LeagueMembersRepository } from '../leagues/league-members.repository';
import { DraftGateway } from './draft.gateway';
import { Draft } from './drafts.model';
import {
  ValidationException,
  NotFoundException,
  ForbiddenException,
} from '../../shared/exceptions';

export class DraftClockService {
  private draftGateway?: DraftGateway;

  constructor(
    private readonly draftRepository: DraftRepository,
    private readonly draftTimerRepository: DraftTimerRepository,
    private readonly leagueRepository: LeagueRepository,
    private readonly leagueMembersRepository: LeagueMembersRepository,
  ) {}

  setGateway(gateway: DraftGateway): void {
    this.draftGateway = gateway;
  }

  async pauseDraft(draftId: string, userId: string): Promise<Draft> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.status !== 'drafting') throw new ValidationException('Draft is not active');

    const member = await this.leagueMembersRepository.findMember(draft.leagueId, userId);
    if (!member || member.role !== 'commissioner') {
      throw new ForbiddenException('Only commissioners can pause/resume drafts');
    }

    const clockState = draft.metadata?.clock_state ?? 'running';

    if (clockState === 'stopped') {
      throw new ValidationException('Draft is stopped. Resume from stop first.');
    }

    if (clockState === 'paused') {
      // Resume from pause — recalculate last_picked / deadlines so timer continues
      const remaining = draft.metadata?.clock_paused_remaining ?? 0;
      const updateData: Record<string, any> = {
        metadata: { ...draft.metadata, clock_state: 'running', clock_paused_remaining: null },
      };

      if (draft.type === 'auction') {
        const nom = draft.metadata?.current_nomination;
        if (nom) {
          updateData.metadata.current_nomination = {
            ...nom,
            bid_deadline: new Date(Date.now() + remaining * 1000).toISOString(),
          };
        } else if (draft.metadata?.nomination_deadline) {
          updateData.metadata.nomination_deadline = new Date(Date.now() + remaining * 1000).toISOString();
        }
      } else {
        // Snake/linear/3rr: shift last_picked so (now - last_picked) yields correct elapsed time
        updateData.lastPicked = new Date(Date.now() - (draft.settings.pick_timer - remaining) * 1000).toISOString();
      }

      const updated = await this.draftRepository.update(draftId, updateData);
      if (!updated) throw new NotFoundException('Draft not found');

      // Schedule server-side timeout for the resumed pick (normal drafts only)
      if (draft.type !== 'auction' && draft.type !== 'slow_auction' && remaining > 0) {
        const runAt = new Date(Date.now() + remaining * 1000);
        await this.draftTimerRepository.insertAutoPickJob(draftId, 'timeout', runAt);
      }

      this.draftGateway?.broadcast(draftId, 'draft:state_updated', { draft: updated, server_time: new Date().toISOString() });
      return updated;
    }

    // Pause — compute remaining time
    let remaining = 0;
    if (draft.type === 'auction') {
      const nom = draft.metadata?.current_nomination;
      if (nom?.bid_deadline) {
        remaining = Math.max(0, Math.ceil((new Date(nom.bid_deadline).getTime() - Date.now()) / 1000));
      } else if (draft.metadata?.nomination_deadline) {
        remaining = Math.max(0, Math.ceil((new Date(draft.metadata.nomination_deadline).getTime() - Date.now()) / 1000));
      }
    } else {
      const ref = draft.lastPicked || draft.startTime;
      if (ref && draft.settings.pick_timer) {
        const deadline = new Date(ref).getTime() + draft.settings.pick_timer * 1000;
        remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      }
    }

    // Cancel pending timeout job (normal drafts)
    if (draft.type !== 'auction' && draft.type !== 'slow_auction') {
      await this.draftTimerRepository.deleteAutoPickJobsByDraft(draftId);
    }

    const updated = await this.draftRepository.update(draftId, {
      metadata: { ...draft.metadata, clock_state: 'paused', clock_paused_remaining: remaining },
    });
    if (!updated) throw new NotFoundException('Draft not found');
    this.draftGateway?.broadcast(draftId, 'draft:state_updated', { draft: updated, server_time: new Date().toISOString() });
    return updated;
  }

  async stopDraft(draftId: string, userId: string): Promise<Draft> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.status !== 'drafting') throw new ValidationException('Draft is not active');

    const member = await this.leagueMembersRepository.findMember(draft.leagueId, userId);
    if (!member || member.role !== 'commissioner') {
      throw new ForbiddenException('Only commissioners can stop/resume drafts');
    }

    const clockState = draft.metadata?.clock_state ?? 'running';

    if (clockState === 'stopped') {
      // Resume from stop — same logic as pause resume
      const remaining = draft.metadata?.clock_paused_remaining ?? 0;
      const updateData: Record<string, any> = {
        metadata: { ...draft.metadata, clock_state: 'running', clock_paused_remaining: null },
      };

      if (draft.type === 'auction') {
        const nom = draft.metadata?.current_nomination;
        if (nom) {
          updateData.metadata.current_nomination = {
            ...nom,
            bid_deadline: new Date(Date.now() + remaining * 1000).toISOString(),
          };
        } else if (draft.metadata?.nomination_deadline) {
          updateData.metadata.nomination_deadline = new Date(Date.now() + remaining * 1000).toISOString();
        }
      } else {
        updateData.lastPicked = new Date(Date.now() - (draft.settings.pick_timer - remaining) * 1000).toISOString();
      }

      const updated = await this.draftRepository.update(draftId, updateData);
      if (!updated) throw new NotFoundException('Draft not found');

      // Schedule server-side timeout for the resumed pick (normal drafts only)
      if (draft.type !== 'auction' && draft.type !== 'slow_auction' && remaining > 0) {
        const runAt = new Date(Date.now() + remaining * 1000);
        await this.draftTimerRepository.insertAutoPickJob(draftId, 'timeout', runAt);
      }

      this.draftGateway?.broadcast(draftId, 'draft:state_updated', { draft: updated, server_time: new Date().toISOString() });
      return updated;
    }

    // Stop — compute remaining time (if already paused, keep its remaining)
    let remaining: number;
    if (clockState === 'paused') {
      remaining = draft.metadata?.clock_paused_remaining ?? 0;
    } else {
      if (draft.type === 'auction') {
        const nom = draft.metadata?.current_nomination;
        if (nom?.bid_deadline) {
          remaining = Math.max(0, Math.ceil((new Date(nom.bid_deadline).getTime() - Date.now()) / 1000));
        } else if (draft.metadata?.nomination_deadline) {
          remaining = Math.max(0, Math.ceil((new Date(draft.metadata.nomination_deadline).getTime() - Date.now()) / 1000));
        } else {
          remaining = 0;
        }
      } else {
        const ref = draft.lastPicked || draft.startTime;
        if (ref && draft.settings.pick_timer) {
          const deadline = new Date(ref).getTime() + draft.settings.pick_timer * 1000;
          remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        } else {
          remaining = 0;
        }
      }
    }

    // Cancel pending timeout job when stopping from running (normal drafts)
    // (When stopping from paused, the job was already cancelled on pause)
    if (clockState === 'running' && draft.type !== 'auction' && draft.type !== 'slow_auction') {
      await this.draftTimerRepository.deleteAutoPickJobsByDraft(draftId);
    }

    const updated = await this.draftRepository.update(draftId, {
      metadata: { ...draft.metadata, clock_state: 'stopped', clock_paused_remaining: remaining },
    });
    if (!updated) throw new NotFoundException('Draft not found');
    this.draftGateway?.broadcast(draftId, 'draft:state_updated', { draft: updated, server_time: new Date().toISOString() });
    return updated;
  }

  async updateTimers(draftId: string, userId: string, timerSettings: Record<string, number>): Promise<Draft> {
    const draft = await this.draftRepository.findById(draftId);
    if (!draft) throw new NotFoundException('Draft not found');
    if (draft.status !== 'drafting') throw new ValidationException('Draft is not active');

    const member = await this.leagueMembersRepository.findMember(draft.leagueId, userId);
    if (!member || member.role !== 'commissioner') {
      throw new ForbiddenException('Only commissioners can update timers');
    }

    const newSettings = { ...draft.settings, ...timerSettings };
    const clockState = draft.metadata?.clock_state ?? 'running';
    const updateData: Record<string, any> = { settings: newSettings };

    if (clockState === 'paused' || clockState === 'stopped') {
      // When paused/stopped, update the frozen remaining time to the new timer value
      const relevantTimer = draft.type === 'auction'
        ? (draft.metadata?.current_nomination
            ? (timerSettings.nomination_timer ?? draft.settings.nomination_timer)
            : (timerSettings.offering_timer ?? draft.settings.offering_timer))
        : (timerSettings.pick_timer ?? draft.settings.pick_timer);
      updateData.metadata = { ...draft.metadata, clock_paused_remaining: relevantTimer };
    } else if (draft.type === 'auction') {
      // Running auction — reset current deadline
      const nom = draft.metadata?.current_nomination;
      if (nom?.bid_deadline && timerSettings.nomination_timer != null) {
        updateData.metadata = {
          ...draft.metadata,
          current_nomination: {
            ...nom,
            bid_deadline: new Date(Date.now() + timerSettings.nomination_timer * 1000).toISOString(),
          },
        };
      } else if (draft.metadata?.nomination_deadline && timerSettings.offering_timer != null) {
        updateData.metadata = {
          ...draft.metadata,
          nomination_deadline: new Date(Date.now() + timerSettings.offering_timer * 1000).toISOString(),
        };
      }
    } else if (draft.type !== 'slow_auction' && timerSettings.pick_timer != null) {
      // Running snake/linear/3rr — reset pick deadline
      updateData.lastPicked = new Date(Date.now()).toISOString();
      // Cancel old timeout and schedule new one
      await this.draftTimerRepository.deleteAutoPickJobsByDraft(draftId);
      const runAt = new Date(Date.now() + timerSettings.pick_timer * 1000);
      await this.draftTimerRepository.insertAutoPickJob(draftId, 'timeout', runAt);
    }
    // Slow auction: only settings change, active lots keep existing deadlines

    const updated = await this.draftRepository.update(draftId, updateData);
    if (!updated) throw new NotFoundException('Draft not found');
    this.draftGateway?.broadcast(draftId, 'draft:state_updated', { draft: updated, server_time: new Date().toISOString() });
    return updated;
  }
}
