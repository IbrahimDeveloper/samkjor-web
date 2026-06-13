const TOKEN_KEY = "sk_token";
const USER_KEY = "sk_user";

export interface StoredUser {
  user_id: string;
  role: "driver" | "passenger" | "both";
  name?: string;
}

export function saveAuth(token: string, user: StoredUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): StoredUser | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as StoredUser) : null;
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isLoggedIn(): boolean {
  return !!getToken();
}
