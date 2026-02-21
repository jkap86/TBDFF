export class User {
  constructor(
    public readonly userId: string,
    public readonly username: string,
    public readonly displayUsername: string,
    public readonly email: string,
    public readonly passwordHash: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date
  ) {}

  static fromDatabase(row: {
    id: string;
    username: string;
    display_username: string;
    email: string;
    password_hash: string;
    created_at: Date;
    updated_at: Date;
  }): User {
    return new User(
      row.id,
      row.username,
      row.display_username,
      row.email,
      row.password_hash,
      row.created_at,
      row.updated_at
    );
  }

  static isValidUsername(username: string): boolean {
    return /^[a-zA-Z0-9_]{3,20}$/.test(username);
  }

  static readonly MIN_PASSWORD_LENGTH = 8;

  toSafeObject() {
    return {
      userId: this.userId,
      username: this.username,
      displayUsername: this.displayUsername,
      email: this.email,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
