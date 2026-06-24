const SESSION_COOKIE = "sessionid";
const SESSION_READY_KEY = "ai-live-douyin-session-ready";

export function parseSessionIdFromCookieString(cookieText: string) {
  const text = String(cookieText || "");
  const match = text.match(/(?:^|;\s*)sessionid=([^;]+)/i);
  return match ? decodeURIComponent(match[1].trim()) : "";
}

export function readSessionIdFromCookie() {
  return parseSessionIdFromCookieString(document.cookie);
}

export function markDouyinSessionReady() {
  sessionStorage.setItem(SESSION_READY_KEY, "1");
}

export function clearDouyinSessionReady() {
  sessionStorage.removeItem(SESSION_READY_KEY);
}

export function hasDouyinSessionId() {
  return Boolean(readSessionIdFromCookie()) || sessionStorage.getItem(SESSION_READY_KEY) === "1";
}

/** 写入浏览器 Cookie，dycast 的 /dylive、/socket 请求会自动带上 sessionid */
export function setDouyinSessionCookies(sessionId: string) {
  const value = String(sessionId || "").trim();
  if (!value) return false;
  const maxAge = 604800;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
  document.cookie = `sessionid_ss=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
  markDouyinSessionReady();
  return true;
}

export function clearDouyinSessionCookies() {
  document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0`;
  document.cookie = "sessionid_ss=; Path=/; Max-Age=0";
  clearDouyinSessionReady();
}

export function ensureDouyinSessionCookie(manualSessionId = "") {
  const manual = manualSessionId.trim();
  if (manual) {
    setDouyinSessionCookies(manual);
    return manual;
  }
  const fromCookie = readSessionIdFromCookie();
  if (fromCookie) {
    return fromCookie;
  }
  if (hasDouyinSessionId()) {
    return fromCookie || "ready";
  }
  throw new Error("请先粘贴 sessionid 并点击保存，或完成抖音登录。");
}

function upsertCookiePair(cookieJar: Map<string, string>, part: string) {
  const trimmed = part.trim();
  if (!trimmed) return;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) return;
  const name = trimmed.slice(0, eq).trim();
  const value = trimmed.slice(eq + 1).trim();
  if (!name) return;
  cookieJar.set(name, value);
}

/** 合并 document.cookie / curl -b 与 sessionid，供后端 Worker 复刻浏览器 Cookie 头 */
export function buildDouyinCookieHeader(options: {
  sessionId: string;
  cookieText?: string;
}) {
  const cookieJar = new Map<string, string>();
  const raw = String(options.cookieText || "").trim() || (typeof document !== "undefined" ? document.cookie : "");
  for (const part of raw.split(";")) {
    upsertCookiePair(cookieJar, part);
  }
  const sessionId = String(options.sessionId || "").trim();
  if (sessionId) {
    cookieJar.set("sessionid", sessionId);
    cookieJar.set("sessionid_ss", sessionId);
    cookieJar.set("sid_tt", sessionId);
  }
  return [...cookieJar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

export async function verifyDouyinProxyAvailable() {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch("/dylive/", {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    const snippet = (await response.text()).slice(0, 6000).toLowerCase();
    return snippet.includes("douyin") || snippet.includes("byte");
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}
