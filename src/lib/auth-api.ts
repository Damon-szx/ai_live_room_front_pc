import { apiRequest } from "./api-client";
import type { AuthUser } from "./auth-storage";

type AuthResponse = {
  token: string;
  expiresIn: number;
  user: AuthUser;
};

export function sendSmsCode(phone: string) {
  return apiRequest<{ sent: boolean; expiresIn: number; message: string; devHint?: string }>(
    "/api/auth/sms/send",
    {
      method: "POST",
      body: { phone },
      auth: false,
    },
  );
}

export function loginWithPassword(phone: string, password: string) {
  return apiRequest<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: { phone, password },
    auth: false,
  });
}

export function registerAccount(phone: string, password: string, nickname: string) {
  return apiRequest<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: { phone, password, nickname },
    auth: false,
  });
}

export function fetchCurrentUser() {
  return apiRequest<{ user: AuthUser }>("/api/auth/me");
}

export function logoutAccount() {
  return apiRequest<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
}
