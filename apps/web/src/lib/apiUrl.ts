const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");

export function toApiUrl(path: `/api${string}`): string {
  return apiBaseUrl === "" ? path : `${apiBaseUrl}${path}`;
}
