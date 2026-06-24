const TOKEN_KEY = "ai_live_auth_token";
const USER_KEY = "ai_live_auth_user";

export type AuthUser = {
  id: string;
  phone: string;
  nickname: string;
  avatarUrl: string;
};

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setAuthSession(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuthSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return Boolean(getToken());
}
