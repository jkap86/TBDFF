import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { randomUUID } from 'crypto';
import { AutoPickService } from '../modules/drafts/auto-pick.service';
import { DraftRepository } from '../modules/drafts/drafts.repository';
import { findUserByRosterId } from '../modules/drafts/draft-helpers';

/**
 * Polls `auto_pick_jobs` every 1 second and processes continuation/recovery jobs.
 * Uses FOR UPDATE SKIP LOCKED so multiple instances never claim the same job.
 *
 * A 30-second recovery sweep ensures jobs are created for active drafts
 * whose auto-pick chain was interrupted (e.g. crash before continuation scheduled).
 */
export class AutoPickJob {
  private pollTask: ScheduledTask | null = null;
  private recoveryTask: ScheduledTask | null = null;
  private readonly instanceId: string;

  constructor(
    private readonly autoPickService: AutoPickService,
    private readonly draftRepository: DraftRepository,
  ) {
    this.instanceId = randomUUID();
  }

  start(): void {
    // Poll every 1 second for runnable auto-pick jobs
    this.pollTask = cron.schedule('*/1 * * * * *', () => { this.poll(); });

    // Every 30 seconds: recover orphaned chains + reset stale claims
    this.recoveryTask = cron.schedule('*/30 * * * * *', () => { this.recover(); });

    console.log(`[AutoPickJob] Started (instance ${this.instanceId.slice(0, 8)})`);
  }

  private async poll(): Promise<void> {
    try {
      const jobs = await this.draftRepository.claimAutoPickJobs(this.instanceId, 5);

      for (const job of jobs) {
        try {
          await this.autoPickService.processAutoPickFromJob(job.draft_id);
        } catch (err) {
          console.error(`[AutoPickJob] Failed for draft ${job.draft_id}:`, err);
        } finally {
          await this.draftRepository.deleteAutoPickJob(job.id);
        }
      }
    } catch (err) {
      console.error('[AutoPickJob] Poll failed:', err);
    }
  }

  private async recover(): Promise<void> {
    try {
      // Reset jobs claimed > 30s ago (instance probably crashed mid-processing)
      const reset = await this.draftRepository.resetStaleAutoPickClaims(30);
      if (reset > 0) {
        console.log(`[AutoPickJob] Reset ${reset} stale auto-pick claim(s)`);
      }

      // Ensure active drafts with auto-pick users have a job if needed
      const drafts = await this.draftRepository.findDraftingNormalDraftsNeedingAutoPick();
      for (const draft of drafts) {
        const nextPick = await this.draftRepository.findNextPick(draft.id);
        if (!nextPick) continue;

        const autoPickUsers: string[] = draft.metadata?.auto_pick_users ?? [];
        const pickOwner = findUserByRosterId(
          draft.draftOrder,
          draft.slotToRosterId,
          nextPick.rosterId,
        );
        if (!pickOwner || !autoPickUsers.includes(pickOwner)) continue;

        const hasJob = await this.draftRepository.hasAutoPickJob(draft.id);
        if (!hasJob) {
          console.log(`[AutoPickJob] Recovering orphaned auto-pick chain for draft ${draft.id}`);
          await this.draftRepository.insertAutoPickJob(draft.id, 'recovery');
        }
      }
    } catch (err) {
      console.error('[AutoPickJob] Recovery failed:', err);
    }
  }

  stop(): void {
    this.pollTask?.stop();
    this.recoveryTask?.stop();
    this.pollTask = null;
    this.recoveryTask = null;
  }
}
