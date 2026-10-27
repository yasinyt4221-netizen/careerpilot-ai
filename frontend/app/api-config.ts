export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
export const HOSTED_MODE = process.env.NEXT_PUBLIC_HOSTED_MODE === "true";
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || (DEMO_MODE ? "" : "http://127.0.0.1:8000")).replace(/\/+$/, "");
export const publicAsset = (path: string) => `${BASE_PATH}/${path.replace(/^\//, "")}`;

let accessToken = "";
export const setAccessToken = (token: string) => { accessToken = token; };
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (HOSTED_MODE && accessToken && url.startsWith(`${API_URL}/api/`)) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(url, { ...init, headers, credentials: "omit" });
  if (HOSTED_MODE && response.status === 401) {
    accessToken = "";
    window.dispatchEvent(new Event("careerpilot-access-expired"));
  }
  return response;
}
