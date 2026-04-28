export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

export function apiUrl(path) {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function getUserId() {
  if (typeof window === "undefined") {
    return "server-render";
  }

  let userId = window.localStorage.getItem("sprachtrainer_user_id");

  if (!userId) {
    userId = window.crypto.randomUUID();
    window.localStorage.setItem("sprachtrainer_user_id", userId);
  }

  return userId;
}

export function apiHeaders(extraHeaders = {}) {
  return {
    "Content-Type": "application/json",
    "X-User-Id": getUserId(),
    ...extraHeaders,
  };
}