export class Message {
  constructor(
    public readonly id: string,
    public readonly senderId: string | null,
    public readonly senderUsername: string | null,
    public readonly leagueId: string | null,
    public readonly conversationId: string | null,
    public readonly content: string,
    public readonly messageType: 'user' | 'system',
    public readonly metadata: Record<string, unknown> | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static fromDatabase(row: any): Message {
    return new Message(
      row.id,
      row.sender_id ?? null,
      row.sender_username ?? null,
      row.league_id ?? null,
      row.conversation_id ?? null,
      row.content,
      row.message_type ?? 'user',
      row.metadata ?? null,
      row.created_at,
      row.updated_at,
    );
  }

  toSafeObject() {
    return {
      id: this.id,
      sender_id: this.senderId,
      sender_username: this.senderUsername,
      league_id: this.leagueId,
      conversation_id: this.conversationId,
      content: this.content,
      message_type: this.messageType,
      metadata: this.metadata,
      created_at: this.createdAt,
      updated_at: this.updatedAt,
    };
  }
}

export class Conversation {
  constructor(
    public readonly id: string,
    public readonly userAId: string,
    public readonly userBId: string,
    public readonly otherUsername: string,
    public readonly lastMessage: string | null,
    public readonly lastMessageAt: Date | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static fromDatabase(row: any): Conversation {
    return new Conversation(
      row.id,
      row.user_a_id,
      row.user_b_id,
      row.other_username,
      row.last_message ?? null,
      row.last_message_at ?? null,
      row.created_at,
      row.updated_at,
    );
  }

  toSafeObject() {
    return {
      id: this.id,
      user_a_id: this.userAId,
      user_b_id: this.userBId,
      other_username: this.otherUsername,
      last_message: this.lastMessage,
      last_message_at: this.lastMessageAt,
      created_at: this.createdAt,
      updated_at: this.updatedAt,
    };
  }
}
