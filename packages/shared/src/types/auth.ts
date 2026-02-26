export interface User {
  id: string;
  username: string;
  display_username: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  user: User;
  token: string;
  /** Present only for mobile clients (X-Client: mobile). Web uses httpOnly cookie. */
  refreshToken?: string;
}

export interface UserResponse {
  user: User;
}
