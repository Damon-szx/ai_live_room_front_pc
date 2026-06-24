import { getToken, clearAuthSession } from "./auth-storage";
import { ApiError } from "./api-client";

function resolveApiBase(): string {
  return import.meta.env.VITE_API_BASE_URL || "";
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    if (typeof payload?.detail === "string") {
      return payload.detail;
    }
    if (typeof payload?.error === "string") {
      return payload.error;
    }
    if (Array.isArray(payload?.detail)) {
      return payload.detail.map((item: { msg?: string }) => item.msg || "请求失败").join("；");
    }
  } catch {
    // ignore
  }
  return "请求失败，请稍后重试";
}

export async function apiUploadForm<T>(path: string, formData: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${resolveApiBase()}${path}`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (response.status === 401) {
    clearAuthSession();
  }

  if (!response.ok) {
    throw new ApiError(await parseErrorMessage(response), response.status);
  }

  return (await response.json()) as T;
}
