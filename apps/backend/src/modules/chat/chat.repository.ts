import { Pool } from 'pg';
import { Message, Conversation } from './chat.model';

export class ChatRepository {
  constructor(private readonly db: Pool) {}

  async findLeagueMessages(leagueId: string, limit: number, before: string | null): Promise<Message[]> {
    const query = before
      ? `SELECT m.*, u.display_username AS sender_username
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.league_id = $1
           AND m.created_at < (SELECT created_at FROM messages WHERE id = $3)
         ORDER BY m.created_at DESC
         LIMIT $2`
      : `SELECT m.*, u.display_username AS sender_username
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.league_id = $1
         ORDER BY m.created_at DESC
         LIMIT $2`;

    const params = before ? [leagueId, limit, before] : [leagueId, limit];
    const result = await this.db.query(query, params);
    return result.rows.map(Message.fromDatabase);
  }

  async findConversationMessages(conversationId: string, limit: number, before: string | null): Promise<Message[]> {
    const query = before
      ? `SELECT m.*, u.display_username AS sender_username
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.conversation_id = $1
           AND m.created_at < (SELECT created_at FROM messages WHERE id = $3)
         ORDER BY m.created_at DESC
         LIMIT $2`
      : `SELECT m.*, u.display_username AS sender_username
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.conversation_id = $1
         ORDER BY m.created_at DESC
         LIMIT $2`;

    const params = before ? [conversationId, limit, before] : [conversationId, limit];
    const result = await this.db.query(query, params);
    return result.rows.map(Message.fromDatabase);
  }

  async createMessage(data: {
    leagueId?: string;
    conversationId?: string;
    senderId: string;
    content: string;
  }): Promise<Message> {
    const result = await this.db.query(
      `INSERT INTO messages (sender_id, league_id, conversation_id, content)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [data.senderId, data.leagueId ?? null, data.conversationId ?? null, data.content],
    );

    // Fetch with sender username joined
    const row = await this.db.query(
      `SELECT m.*, u.display_username AS sender_username
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.id = $1`,
      [result.rows[0].id],
    );
    return Message.fromDatabase(row.rows[0]);
  }

  async findOrCreateConversation(userAId: string, userBId: string): Promise<Conversation> {
    // Canonicalize ordering so (A,B) and (B,A) match the same row
    const least = [userAId, userBId].sort()[0];
    const greatest = [userAId, userBId].sort()[1];

    await this.db.query(
      `INSERT INTO conversations (user_a_id, user_b_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [least, greatest],
    );

    const result = await this.db.query(
      `SELECT c.*,
              CASE WHEN c.user_a_id = $1 THEN ub.display_username ELSE ua.display_username END AS other_username,
              (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
              (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_at
       FROM conversations c
       JOIN users ua ON ua.id = c.user_a_id
       JOIN users ub ON ub.id = c.user_b_id
       WHERE (c.user_a_id = $1 AND c.user_b_id = $2)
          OR (c.user_a_id = $2 AND c.user_b_id = $1)`,
      [userAId, userBId],
    );
    return Conversation.fromDatabase(result.rows[0]);
  }

  async findConversationById(id: string): Promise<Conversation | null> {
    const result = await this.db.query(
      `SELECT c.*,
              '' AS other_username,
              NULL AS last_message,
              NULL AS last_message_at
       FROM conversations c
       WHERE c.id = $1`,
      [id],
    );
    return result.rows.length > 0 ? Conversation.fromDatabase(result.rows[0]) : null;
  }

  async findConversationsByUserId(userId: string): Promise<Conversation[]> {
    const result = await this.db.query(
      `SELECT c.*,
              CASE WHEN c.user_a_id = $1 THEN ub.display_username ELSE ua.display_username END AS other_username,
              (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
              (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message_at
       FROM conversations c
       JOIN users ua ON ua.id = c.user_a_id
       JOIN users ub ON ub.id = c.user_b_id
       WHERE c.user_a_id = $1 OR c.user_b_id = $1
       ORDER BY last_message_at DESC NULLS LAST`,
      [userId],
    );
    return result.rows.map(Conversation.fromDatabase);
  }

  async isLeagueMember(leagueId: string, userId: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT 1 FROM league_members WHERE league_id = $1 AND user_id = $2`,
      [leagueId, userId],
    );
    return result.rows.length > 0;
  }
}
