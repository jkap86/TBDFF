import { Pool, PoolClient } from 'pg';
import { Draft } from './drafts.model';

export class DraftTimerRepository {
  constructor(private readonly db: Pool) {}

  // ── Auction Timer Methods (multi-instance safe scheduling) ──

  async upsertAuctionTimer(
    draftId: string,
    timerType: string,
    runAt: Date,
    client?: PoolClient,
  ): Promise<void> {
    const conn = client ?? this.db;
    await conn.query(
      `INSERT INTO auction_timers (draft_id, timer_type, run_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (draft_id) WHERE claimed_by IS NULL
       DO UPDATE SET run_at = $3, timer_type = $2`,
      [draftId, timerType, runAt.toISOString()],
    );
  }

  async cancelAuctionTimers(draftId: string, client?: PoolClient): Promise<void> {
    const conn = client ?? this.db;
    await conn.query('DELETE FROM auction_timers WHERE draft_id = $1', [draftId]);
  }

  async hasAuctionTimer(draftId: string): Promise<boolean> {
    const result = await this.db.query(
      'SELECT 1 FROM auction_timers WHERE draft_id = $1 LIMIT 1',
      [draftId],
    );
    return result.rows.length > 0;
  }

  async claimRunnableTimers(
    instanceId: string,
    limit: number,
  ): Promise<Array<{ id: string; draft_id: string; timer_type: string }>> {
    const result = await this.db.query(
      `UPDATE auction_timers
       SET claimed_by = $1, claimed_at = NOW()
       WHERE id IN (
         SELECT id FROM auction_timers
         WHERE claimed_by IS NULL AND run_at <= NOW()
         ORDER BY run_at
         FOR UPDATE SKIP LOCKED
         LIMIT $2
       )
       RETURNING id, draft_id, timer_type`,
      [instanceId, limit],
    );
    return result.rows;
  }

  async deleteAuctionTimer(timerId: string): Promise<void> {
    await this.db.query('DELETE FROM auction_timers WHERE id = $1', [timerId]);
  }

  async resetStaleClaims(thresholdSeconds: number): Promise<number> {
    const result = await this.db.query(
      `UPDATE auction_timers
       SET claimed_by = NULL, claimed_at = NULL
       WHERE claimed_by IS NOT NULL
         AND claimed_at < NOW() - make_interval(secs => $1)`,
      [thresholdSeconds],
    );
    return result.rowCount ?? 0;
  }

  // ── Auto-Pick Job Methods (multi-instance safe chain continuation) ──

  async insertAutoPickJob(
    draftId: string,
    jobType: 'continuation' | 'recovery' | 'timeout',
    runAt?: Date,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO auto_pick_jobs (draft_id, job_type, run_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (draft_id) WHERE claimed_by IS NULL
       DO UPDATE SET run_at = LEAST(auto_pick_jobs.run_at, $3), job_type = $2`,
      [draftId, jobType, (runAt ?? new Date()).toISOString()],
    );
  }

  async claimAutoPickJobs(
    instanceId: string,
    limit: number,
  ): Promise<Array<{ id: string; draft_id: string; job_type: string }>> {
    const result = await this.db.query(
      `UPDATE auto_pick_jobs
       SET claimed_by = $1, claimed_at = NOW()
       WHERE id IN (
         SELECT id FROM auto_pick_jobs
         WHERE claimed_by IS NULL AND run_at <= NOW()
         ORDER BY run_at
         FOR UPDATE SKIP LOCKED
         LIMIT $2
       )
       RETURNING id, draft_id, job_type`,
      [instanceId, limit],
    );
    return result.rows;
  }

  async deleteAutoPickJob(jobId: string): Promise<void> {
    await this.db.query('DELETE FROM auto_pick_jobs WHERE id = $1', [jobId]);
  }

  async resetStaleAutoPickClaims(thresholdSeconds: number): Promise<number> {
    const result = await this.db.query(
      `UPDATE auto_pick_jobs
       SET claimed_by = NULL, claimed_at = NULL
       WHERE claimed_by IS NOT NULL
         AND claimed_at < NOW() - make_interval(secs => $1)`,
      [thresholdSeconds],
    );
    return result.rowCount ?? 0;
  }

  async hasAutoPickJob(draftId: string): Promise<boolean> {
    const result = await this.db.query(
      'SELECT 1 FROM auto_pick_jobs WHERE draft_id = $1 LIMIT 1',
      [draftId],
    );
    return result.rows.length > 0;
  }

  async findDraftingNormalDraftsNeedingAutoPick(): Promise<Draft[]> {
    const result = await this.db.query(
      `SELECT * FROM drafts
       WHERE status = 'drafting'
         AND type NOT IN ('auction', 'slow_auction')
         AND jsonb_array_length(COALESCE(metadata->'auto_pick_users', '[]'::jsonb)) > 0
         AND (metadata->>'clock_state' IS NULL OR metadata->>'clock_state' = 'running')`,
    );
    return result.rows.map(Draft.fromDatabase);
  }

  async deleteAutoPickJobsByDraft(draftId: string): Promise<void> {
    await this.db.query(
      'DELETE FROM auto_pick_jobs WHERE draft_id = $1 AND claimed_by IS NULL',
      [draftId],
    );
  }

  async findDraftingNormalDrafts(): Promise<Draft[]> {
    const result = await this.db.query(
      `SELECT * FROM drafts
       WHERE status = 'drafting'
         AND type NOT IN ('auction', 'slow_auction')`,
    );
    return result.rows.map(Draft.fromDatabase);
  }
}
